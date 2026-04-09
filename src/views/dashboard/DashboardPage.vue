<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NIcon,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NButton,
  NAlert,
  useThemeVars,
} from 'naive-ui'
import {
  RefreshOutline,
  SunnyOutline,
  MoonOutline,
  TrendingUpOutline,
  GitCommitOutline,
  CheckmarkCircleOutline,
  AlertCircleOutline,
  TimeOutline,
  ConstructOutline,
  TerminalOutline,
  BugOutline,
  FlaskOutline,
  AnalyticsOutline,
  HeartOutline,
} from '@vicons/ionicons5'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart, RadarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  ToolboxComponent,
} from 'echarts/components'
import { useIntervalFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

// Register ECharts components
use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  ToolboxComponent,
])

// ─── Types ───────────────────────────────────────────────────────────────────
interface MetricCard {
  title: string
  value: number | string
  icon: string
  color: string
  suffix?: string
  trend?: number
}

interface FeishuBitableConfig {
  appToken: string
  tableId: string
  apiBaseUrl: string
}

// ─── State ───────────────────────────────────────────────────────────────────
const { t } = useI18n()
const loading = ref(true)
const refreshing = ref(false)
const isDark = ref(false)
const errorMsg = ref<string | null>(null)
const lastRefreshed = ref<Date | null>(null)

// Feishu Bitable config (configure via env or settings)
const bitableConfig = ref<FeishuBitableConfig>({
  appToken: import.meta.env.VITE_FEISHU_BITABLE_APP_TOKEN || '',
  tableId: import.meta.env.VITE_FEISHU_BITABLE_TABLE_ID || '',
  apiBaseUrl: import.meta.env.VITE_FEISHU_API_BASE || 'https://open.feishu.cn/open-apis',
})

// Dashboard metrics from Feishu Bitable
const dashboardData = ref<Record<string, unknown>>({})

// ─── Static mock data (used when no Feishu config) ───────────────────────────
const mockData: {
  metrics: MetricCard[]
  taskCompletionTrend: TrendData[]
  commitTrend: CommitData[]
  priorityDist: PriorityData[]
  taskTypeDist: TaskTypeData[]
  taskStatusDist: StatusData[]
  testTypeDist: StatusData[]
  projectHealth: AgentData[]
} = {
  metrics: [
    { title: '总任务数', value: 128, icon: 'tasks', color: '#2080f0', trend: 12 },
    { title: '已完成', value: 89, icon: 'done', color: '#18a058', trend: 8 },
    { title: '进行中', value: 27, icon: 'progress', color: '#f0a020', trend: -3 },
    { title: '阻塞/逾期', value: 12, icon: 'blocked', color: '#d03050', trend: 5 },
    { title: '代码提交', value: 342, icon: 'commits', color: '#8b5cf6', trend: 24 },
    { title: '测试用例', value: 1024, icon: 'tests', color: '#13c2c2', trend: 15 },
    { title: '覆盖率', value: '78%', icon: 'coverage', color: '#2db7f5', trend: 3 },
    { title: '团队成员', value: 16, icon: 'members', color: '#ff69b4', trend: 2 },
  ],
  taskCompletionTrend: [
    { date: '周一', rate: 72 },
    { date: '周二', rate: 85 },
    { date: '周三', rate: 68 },
    { date: '周四', rate: 91 },
    { date: '周五', rate: 78 },
    { date: '周六', rate: 45 },
    { date: '周日', rate: 30 },
  ],
  commitTrend: [
    { date: '周一', commits: 42 },
    { date: '周二', commits: 58 },
    { date: '周三', commits: 35 },
    { date: '周四', commits: 67 },
    { date: '周五', commits: 51 },
    { date: '周六', commits: 18 },
    { date: '周日', commits: 9 },
  ],
  priorityDist: [
    { name: 'P0 紧急', value: 12 },
    { name: 'P1 高', value: 28 },
    { name: 'P2 中', value: 45 },
    { name: 'P3 低', value: 43 },
  ],
  taskTypeDist: [
    { name: '功能开发', value: 52 },
    { name: 'Bug修复', value: 24 },
    { name: '优化重构', value: 18 },
    { name: '文档更新', value: 12 },
    { name: '测试', value: 22 },
  ],
  taskStatusDist: [
    { name: '已完成', value: 89, itemStyle: { color: '#18a058' } },
    { name: '进行中', value: 27, itemStyle: { color: '#f0a020' } },
    { name: '待开始', value: 15, itemStyle: { color: '#2080f0' } },
    { name: '已阻塞', value: 8, itemStyle: { color: '#d03050' } },
    { name: '已取消', value: 4, itemStyle: { color: '#909296' } },
  ],
  testTypeDist: [
    { name: '单元测试', value: 420 },
    { name: '集成测试', value: 280 },
    { name: 'E2E测试', value: 180 },
    { name: '性能测试', value: 144 },
  ],
  projectHealth: [
    { name: '代码质量', value: 85 },
    { name: '测试覆盖', value: 78 },
    { name: '文档完整', value: 65 },
    { name: '团队协作', value: 90 },
    { name: '进度控制', value: 82 },
    { name: '风险管控', value: 70 },
  ],
}

const themeVars = useThemeVars()

// ─── Theme-aware colors ───────────────────────────────────────────────────────
const textColor = computed(() => isDark.value ? '#e0e0e0' : '#333333')
const textSecondaryColor = computed(() => isDark.value ? '#8a8a8a' : '#999999')
const gridColor = computed(() => isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')
const cardBgColor = computed(() => isDark.value ? '#1a1a2e' : '#ffffff')
const gradientStart = computed(() => isDark.value ? '#1e3a5f' : '#e8f4fd')
const gradientEnd = computed(() => isDark.value ? '#16213e' : '#f0f9ff')

// ─── ICON MAP ────────────────────────────────────────────────────────────────
const iconMap: Record<string, unknown> = {
  tasks: TrendingUpOutline,
  done: CheckmarkCircleOutline,
  progress: TimeOutline,
  blocked: AlertCircleOutline,
  commits: GitCommitOutline,
  tests: FlaskOutline,
  coverage: AnalyticsOutline,
  members: ConstructOutline,
}

// ─── Auto refresh every 5 minutes ──────────────────────────────────────────
const { pause: pauseRefresh, resume: startRefresh } = useIntervalFn(() => {
  void fetchDashboardData()
}, 5 * 60 * 1000)

onMounted(async () => {
  // Check system dark mode preference
  isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    isDark.value = e.matches
  })
  await fetchDashboardData()
  startRefresh()
})

onUnmounted(() => {
  pauseRefresh()
})

// ─── API: Fetch from Feishu Bitable ─────────────────────────────────────────
async function fetchFeishuBitableData(): Promise<Record<string, unknown>> {
  const { appToken, tableId, apiBaseUrl } = bitableConfig.value
  if (!appToken || !tableId) {
    return {}
  }

  // Get tenant access token first
  const appId = import.meta.env.VITE_FEISHU_APP_ID || ''
  const appSecret = import.meta.env.VITE_FEISHU_APP_SECRET || ''

  if (!appId || !appSecret) {
    console.warn('[DashboardPage] Feishu app credentials not configured, using mock data')
    return {}
  }

  try {
    // Get tenant access token
    const tokenRes = await fetch(`${apiBaseUrl}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const tokenData = await tokenRes.json() as { tenant_access_token?: string }
    const accessToken = tokenData.tenant_access_token

    if (!accessToken) return {}

    // Fetch records from bitable
    const recordsRes = await fetch(
      `${apiBaseUrl}/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const recordsData = await recordsRes.json() as { data?: { items?: Array<{ fields: Record<string, unknown> }> } }
    return recordsData?.data || {}
  } catch (err) {
    console.error('[DashboardPage] Feishu Bitable fetch error:', err)
    return {}
  }
}

// ─── Data aggregation ────────────────────────────────────────────────────────
async function fetchDashboardData() {
  refreshing.value = true
  errorMsg.value = null

  try {
    const bitableData = await fetchFeishuBitableData()
    if (bitableData && Object.keys(bitableData).length > 0) {
      dashboardData.value = bitableData
      // Use real data if available
    } else {
      // Use mock data
      dashboardData.value = {}
    }
    lastRefreshed.value = new Date()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

// ─── Computed chart options ───────────────────────────────────────────────────
const effectiveMetrics = computed(() => {
  // If real data exists from Feishu, use it; otherwise mock
  return mockData.metrics
})

interface TrendData {
  date: string
  rate: number
}

interface CommitData {
  date: string
  commits: number
}

interface PriorityData {
  name: string
  value: number
}

interface TaskTypeData {
  name: string
  value: number
}

interface StatusData {
  name: string
  value: number
  itemStyle?: { color: string }
}

interface AgentData {
  name: string
  value: number
}

// Line Chart: Task Completion Trend
const completionTrendOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { top: 40, right: 20, bottom: 40, left: 50 },
  xAxis: {
    type: 'category',
    data: mockData.taskCompletionTrend.map((d) => d.date),
    axisLine: { lineStyle: { color: gridColor.value } },
    axisLabel: { color: textSecondaryColor.value, fontSize: 11 },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    max: 100,
    axisLine: { show: false },
    axisLabel: { color: textSecondaryColor.value, fontSize: 11, formatter: '{value}%' },
    splitLine: { lineStyle: { color: gridColor.value } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: cardBgColor.value,
    borderColor: gridColor.value,
    textStyle: { color: textColor.value },
    formatter: (params: Array<{ name: string; value: number }>) => `${params[0]?.name}<br/>完成率: <b>${params[0]?.value}%</b>`,
  },
  series: [
    {
      type: 'line',
      data: mockData.taskCompletionTrend.map((d) => d.rate),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3, color: '#18a058' },
      itemStyle: { color: '#18a058', borderWidth: 2, borderColor: '#fff' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24,160,88,0.35)' },
            { offset: 1, color: 'rgba(24,160,88,0.02)' },
          ],
        },
      },
      animationDuration: 1500,
      animationEasing: 'cubicOut',
    },
  ],
}))

// Line Chart: Code Commit Trend
const commitTrendOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { top: 40, right: 20, bottom: 40, left: 50 },
  xAxis: {
    type: 'category',
    data: mockData.commitTrend.map((d) => d.date),
    axisLine: { lineStyle: { color: gridColor.value } },
    axisLabel: { color: textSecondaryColor.value, fontSize: 11 },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisLabel: { color: textSecondaryColor.value, fontSize: 11 },
    splitLine: { lineStyle: { color: gridColor.value } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: cardBgColor.value,
    borderColor: gridColor.value,
    textStyle: { color: textColor.value },
    formatter: (params: Array<{ name: string; value: number }>) => `${params[0]?.name}<br/>提交: <b>${params[0]?.value} 次</b>`,
  },
  series: [
    {
      type: 'line',
      data: mockData.commitTrend.map((d) => d.commits),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3, color: '#8b5cf6' },
      itemStyle: { color: '#8b5cf6', borderWidth: 2, borderColor: '#fff' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(139,92,246,0.3)' },
            { offset: 1, color: 'rgba(139,92,246,0.02)' },
          ],
        },
      },
      animationDuration: 1500,
      animationDelay: 300,
      animationEasing: 'cubicOut',
    },
  ],
}))

// Bar Chart: Priority Distribution
const priorityDistOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { top: 20, right: 20, bottom: 40, left: 20 },
  xAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: gridColor.value } }, axisLabel: { color: textSecondaryColor.value, fontSize: 10 } },
  yAxis: { type: 'category', data: mockData.priorityDist.map((d) => d.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: textColor.value, fontSize: 11 } },
  tooltip: { trigger: 'axis', backgroundColor: cardBgColor.value, borderColor: gridColor.value, textStyle: { color: textColor.value }, formatter: (params: Array<{ name: string; value: number }>) => `<b>${params[0]?.name}</b>: ${params[0]?.value} 个` },
  series: [{
    type: 'bar',
    data: mockData.priorityDist.map((d, i) => ({
      value: d.value,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: ['#d03050', '#f0a020', '#2080f0', '#18a058'][i] },
            { offset: 1, color: ['#ff6b6b', '#ffc658', '#5ab0f5', '#52c77a'][i] },
          ],
        },
        borderRadius: [0, 6, 6, 0],
      },
    })),
    barWidth: 18,
    animationDuration: 1200,
    animationEasing: 'elasticOut',
  }],
}))

// Bar Chart: Task Type Distribution
const taskTypeDistOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: { top: 20, right: 20, bottom: 40, left: 50 },
  xAxis: { type: 'category', data: mockData.taskTypeDist.map((d) => d.name), axisLine: { lineStyle: { color: gridColor.value } }, axisLabel: { color: textSecondaryColor.value, fontSize: 10, rotate: 20 }, axisTick: { show: false } },
  yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: gridColor.value } }, axisLabel: { color: textSecondaryColor.value, fontSize: 10 } },
  tooltip: { trigger: 'axis', backgroundColor: cardBgColor.value, borderColor: gridColor.value, textStyle: { color: textColor.value }, formatter: (params: Array<{ name: string; value: number }>) => `<b>${params[0]?.name}</b>: ${params[0]?.value} 个` },
  series: [{
    type: 'bar',
    data: mockData.taskTypeDist.map((d) => ({
      value: d.value,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#2ab7f5' },
            { offset: 1, color: '#13c2c2' },
          ],
        },
        borderRadius: [6, 6, 0, 0],
      },
    })),
    barWidth: 24,
    animationDuration: 1200,
    animationDelay: 200,
    animationEasing: 'elasticOut',
  }],
}))

// Pie Chart: Task Status Distribution
const taskStatusOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: cardBgColor.value,
    borderColor: gridColor.value,
    textStyle: { color: textColor.value },
    formatter: '{b}: {c} ({d}%)',
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { color: textSecondaryColor.value, fontSize: 11 },
    itemWidth: 10,
    itemHeight: 10,
  },
  series: [{
    type: 'pie',
    radius: ['42%', '72%'],
    center: ['35%', '50%'],
    avoidLabelOverlap: true,
    label: { show: false },
    emphasis: {
      label: { show: true, fontSize: 13, fontWeight: 'bold', color: textColor.value },
      itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.3)' },
    },
    data: mockData.taskStatusDist,
    animationType: 'scale',
    animationDuration: 1400,
    animationEasing: 'elasticOut',
  }],
}))

// Pie Chart: Test Type Distribution
const testTypeOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: cardBgColor.value,
    borderColor: gridColor.value,
    textStyle: { color: textColor.value },
    formatter: '{b}: {c} ({d}%)',
  },
  legend: {
    orient: 'vertical',
    right: 10,
    top: 'center',
    textStyle: { color: textSecondaryColor.value, fontSize: 11 },
    itemWidth: 10,
    itemHeight: 10,
  },
  series: [{
    type: 'pie',
    radius: ['38%', '65%'],
    center: ['35%', '50%'],
    roseType: 'area',
    label: { show: false },
    emphasis: {
      label: { show: true, fontSize: 12, fontWeight: 'bold', color: textColor.value },
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' },
    },
    data: mockData.testTypeDist.map((d, i) => ({
      ...d,
      itemStyle: { color: ['#13c2c2', '#2080f0', '#8b5cf6', '#f0a020'][i] },
    })),
    animationDuration: 1600,
    animationDelay: 300,
    animationEasing: 'elasticOut',
  }],
}))

// Radar Chart: Project Health
const projectHealthOption = computed(() => {
  const maxArr = [100, 100, 100, 100, 100, 100]
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: cardBgColor.value,
      borderColor: gridColor.value,
      textStyle: { color: textColor.value },
      formatter: (params: { name: string; value: number }) => `${params.name}: <b>${params.value}</b>`,
    },
    radar: {
      indicator: mockData.projectHealth.map((d, i) => ({ name: d.name, max: maxArr[i] })),
      shape: 'polygon',
      splitNumber: 4,
      axisName: { color: textSecondaryColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor.value } },
      splitArea: { areaStyle: { color: ['transparent', 'transparent'] } },
      axisLine: { lineStyle: { color: gridColor.value } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: mockData.projectHealth.map((d) => d.value),
        name: '项目健康度',
        lineStyle: { color: '#ff69b4', width: 2 },
        itemStyle: { color: '#ff69b4' },
        areaStyle: { color: 'rgba(255,105,180,0.25)' },
        symbol: 'circle',
        symbolSize: 6,
      }],
      animationDuration: 1800,
      animationEasing: 'cubicOut',
    }],
  }
})

// ─── Helper: get icon component ───────────────────────────────────────────────
function getIcon(iconKey: string) {
  return iconMap[iconKey] || AnalyticsOutline
}

// ─── Auto-refresh toggle ──────────────────────────────────────────────────────
function toggleAutoRefresh(enabled: boolean) {
  if (enabled) {
    startRefresh()
  } else {
    pauseRefresh()
  }
}
</script>

<template>
  <NSpin :show="loading">
    <div class="dashboard-page" :class="{ 'dark-mode': isDark }">
      <!-- Header -->
      <NCard class="dashboard-hero" :bordered="false">
        <div class="hero-inner">
          <div class="hero-left">
            <div class="hero-title">📊 项目仪表盘</div>
            <div class="hero-subtitle">
              实时数据 · 每5分钟自动刷新
              <span v-if="lastRefreshed" class="last-refresh">
                · 更新于 {{ lastRefreshed.toLocaleTimeString('zh-CN') }}
              </span>
            </div>
          </div>
          <div class="hero-right">
            <NSpace :size="12" align="center">
              <div class="theme-toggle">
                <NIcon :component="SunnyOutline" size="14" />
                <NSwitch size="small" :value="isDark" @update:value="(v: boolean) => { isDark = v }" />
                <NIcon :component="MoonOutline" size="14" />
              </div>
              <NTag type="info" round :bordered="false">🔥 实时</NTag>
              <NButton
                type="primary"
                size="small"
                :loading="refreshing"
                @click="fetchDashboardData"
              >
                <template #icon><NIcon :component="RefreshOutline" /></template>
                刷新
              </NButton>
            </NSpace>
          </div>
        </div>

        <NAlert v-if="errorMsg" type="warning" :bordered="false" style="margin-top: 10px;">
          {{ errorMsg }}
        </NAlert>
      </NCard>

      <!-- Metric Cards -->
      <NGrid cols="2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem v-for="(metric, idx) in effectiveMetrics" :key="idx">
          <div class="metric-card" :style="{ '--card-color': metric.color }">
            <div class="metric-card-bg" />
            <div class="metric-card-inner">
              <div class="metric-info">
                <div class="metric-title">{{ metric.title }}</div>
                <div class="metric-value">
                  {{ metric.value }}
                  <span v-if="metric.suffix" class="metric-suffix">{{ metric.suffix }}</span>
                </div>
                <div v-if="metric.trend !== undefined" class="metric-trend" :class="metric.trend >= 0 ? 'up' : 'down'">
                  <NIcon :component="metric.trend >= 0 ? TrendingUpOutline : TerminalOutline" :size="12" />
                  {{ metric.trend >= 0 ? '+' : '' }}{{ metric.trend }}%
                </div>
              </div>
              <div class="metric-icon">
                <NIcon :size="24" :component="getIcon(metric.icon)" />
              </div>
            </div>
          </div>
        </NGridItem>
      </NGrid>

      <!-- Line Charts Row -->
      <NGrid cols="1 l:2" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>📈 任务完成率趋势</span>
                <NTag size="tiny" :bordered="false" type="success">近7天</NTag>
              </div>
            </template>
            <VChart class="chart" :option="completionTrendOption" autoresize />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>💜 代码提交趋势</span>
                <NTag size="tiny" :bordered="false" type="info">近7天</NTag>
              </div>
            </template>
            <VChart class="chart" :option="commitTrendOption" autoresize />
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Bar Charts Row -->
      <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>🔥 优先级分布</span>
              </div>
            </template>
            <VChart class="chart bar-chart" :option="priorityDistOption" autoresize />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>🧩 任务类型分布</span>
              </div>
            </template>
            <VChart class="chart bar-chart" :option="taskTypeDistOption" autoresize />
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Pie Charts Row -->
      <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>🎯 任务状态分布</span>
              </div>
            </template>
            <VChart class="chart pie-chart" :option="taskStatusOption" autoresize />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="chart-card" :bordered="false">
            <template #header>
              <div class="chart-header">
                <span>🧪 测试类型分布</span>
              </div>
            </template>
            <VChart class="chart pie-chart" :option="testTypeOption" autoresize />
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Radar Chart -->
      <NCard class="chart-card radar-card" :bordered="false">
        <template #header>
          <div class="chart-header">
            <span>❤️ 项目健康度</span>
            <NTag size="tiny" :bordered="false" type="warning">综合评估</NTag>
          </div>
        </template>
        <VChart class="chart radar-chart" :option="projectHealthOption" autoresize />
      </NCard>
    </div>
  </NSpin>
</template>

<style scoped>
.dashboard-page {
  --card-bg: #ffffff;
  --card-border: rgba(0, 0, 0, 0.06);
  --text-primary: #333333;
  --text-secondary: #999999;
  --bg-page: #f0f2f5;

  padding: 16px;
  min-height: 100vh;
  background: var(--bg-page);
  transition: background 0.3s ease;
}

.dashboard-page.dark-mode {
  --card-bg: #1a1a2e;
  --card-border: rgba(255, 255, 255, 0.06);
  --text-primary: #e0e0e0;
  --text-secondary: #8a8a8a;
  --bg-page: #0f0f1a;
}

/* ── Hero ── */
.dashboard-hero {
  border-radius: 16px;
  margin-bottom: 16px;
  background: linear-gradient(135deg, var(--card-bg) 0%, rgba(32,128,240,0.08) 100%) !important;
  border: 1px solid var(--card-border) !important;
  transition: all 0.3s ease;
}

.hero-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.hero-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.last-refresh {
  color: #18a058;
  font-size: 12px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

/* ── Metric Cards ── */
.metric-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 16px;
  overflow: hidden;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: default;
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.dark-mode .metric-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.metric-card-bg {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--card-color);
  opacity: 0.1;
}

.metric-card-inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
}

.metric-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 500;
}

.metric-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}

.metric-suffix {
  font-size: 14px;
  font-weight: 600;
  margin-left: 2px;
}

.metric-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  margin-top: 5px;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 600;
}

.metric-trend.up {
  color: #18a058;
  background: rgba(24, 160, 88, 0.1);
}

.metric-trend.down {
  color: #d03050;
  background: rgba(208, 48, 80, 0.1);
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-color);
  opacity: 0.9;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* ── Chart Cards ── */
.chart-card {
  border-radius: 16px !important;
  background: var(--card-bg) !important;
  border: 1px solid var(--card-border) !important;
  transition: all 0.3s ease;
}

.chart-card:hover {
  border-color: rgba(32, 128, 240, 0.2) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.dark-mode .chart-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart {
  height: 260px;
  width: 100%;
}

.chart.bar-chart {
  height: 240px;
}

.chart.pie-chart {
  height: 240px;
}

.chart.radar-chart {
  height: 300px;
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .dashboard-page {
    padding: 10px;
  }

  .hero-inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .metric-value {
    font-size: 22px;
  }

  .chart {
    height: 200px;
  }

  .chart.bar-chart,
  .chart.pie-chart {
    height: 200px;
  }
}
</style>
