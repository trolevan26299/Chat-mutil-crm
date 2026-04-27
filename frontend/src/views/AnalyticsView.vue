<template>
  <div>
    <!-- Header -->
    <v-row class="mb-2 mt-1" align="center" dense>
      <v-col cols="12" sm="5" class="d-flex align-center">
        <h1 class="text-h5 mb-0">
          <v-icon class="mr-2" color="primary">mdi-chart-timeline-variant-shimmer</v-icon>
          Phân tích nâng cao
        </h1>
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="dateFrom"
          label="Từ ngày"
          type="date"
          density="compact"
          variant="outlined"
          hide-details
        />
      </v-col>
      <v-col cols="6" sm="3">
        <v-text-field
          v-model="dateTo"
          label="Đến ngày"
          type="date"
          density="compact"
          variant="outlined"
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="1">
        <v-btn color="primary" block prepend-icon="mdi-refresh" :loading="loading" @click="fetchAll">Xem</v-btn>
      </v-col>
    </v-row>

    <!-- Tabs -->
    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="overview">Tổng quan</v-tab>
      <v-tab value="funnel">Phễu khách hàng</v-tab>
      <v-tab value="team">Đội nhóm</v-tab>
      <v-tab value="response">Thời gian trả lời</v-tab>
      <v-tab value="builder">Báo cáo tùy chỉnh</v-tab>
    </v-tabs>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-window v-model="tab">
      <!-- Overview -->
      <v-window-item value="overview">
        <v-row>
          <v-col cols="12" md="6">
            <ConversionFunnelChart :data="funnel" />
          </v-col>
          <v-col cols="12" md="6">
            <ResponseTimeChart :data="responseTime" />
          </v-col>
          <v-col cols="12">
            <TeamLeaderboard :data="teamPerformance" />
          </v-col>
        </v-row>
      </v-window-item>

      <!-- Funnel -->
      <v-window-item value="funnel">
        <ConversionFunnelChart :data="funnel" />
      </v-window-item>

      <!-- Team -->
      <v-window-item value="team">
        <TeamLeaderboard :data="teamPerformance" />
      </v-window-item>

      <!-- Response Time -->
      <v-window-item value="response">
        <v-row>
          <v-col cols="12">
            <ResponseTimeChart :data="responseTime" />
          </v-col>
          <v-col cols="12" v-if="responseTime?.byUser?.length">
            <v-card>
              <v-card-title class="text-body-1">Thời gian trả lời theo nhân viên</v-card-title>
              <v-card-text>
                <v-data-table
                  :headers="rtUserHeaders"
                  :items="responseTime.byUser"
                  density="compact"
                  no-data-text="Không có dữ liệu"
                >
                  <template #item.avgSeconds="{ item }">
                    {{ formatTime(item.avgSeconds) }}
                  </template>
                </v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <!-- Custom Report Builder -->
      <v-window-item value="builder">
        <ReportBuilder
          :result="customResult"
          :saved-reports="savedReports"
          :loading="loading"
          :date-from="dateFrom"
          :date-to="dateTo"
          @run="runCustomReport"
          @save="onSaveReport"
          @run-saved="onRunSaved"
          @delete-saved="deleteSavedReport"
        />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAnalytics } from '@/composables/use-analytics';
import type { ReportConfig, SavedReport } from '@/composables/use-analytics';
import ConversionFunnelChart from '@/components/analytics/ConversionFunnelChart.vue';
import TeamLeaderboard from '@/components/analytics/TeamLeaderboard.vue';
import ResponseTimeChart from '@/components/analytics/ResponseTimeChart.vue';
import ReportBuilder from '@/components/analytics/ReportBuilder.vue';
import { ref } from 'vue';

const {
  funnel, teamPerformance, responseTime, customResult, savedReports,
  loading, dateFrom, dateTo,
  fetchAll, runCustomReport, fetchSavedReports, createSavedReport, deleteSavedReport, runSavedReport,
} = useAnalytics();

const tab = ref('overview');

const rtUserHeaders = [
  { title: 'Họ tên', key: 'fullName' },
  { title: 'TG trả lời TB', key: 'avgSeconds', align: 'end' as const },
];

function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} giây`;
  return `${m} phút ${s} giây`;
}

async function onSaveReport(data: { name: string; type: string; config: ReportConfig }) {
  await createSavedReport(data);
}

async function onRunSaved(report: SavedReport) {
  const result = await runSavedReport(report.id);
  if (result) customResult.value = result;
  tab.value = 'builder';
}

onMounted(() => {
  fetchAll();
  fetchSavedReports();
});
</script>
