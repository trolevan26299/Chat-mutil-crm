<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-6">
      <v-icon class="mr-2" color="primary">mdi-view-dashboard</v-icon>Dashboard
    </h1>

    <!-- Stats Cards -->
    <v-row class="mb-6">
      <v-col v-for="stat in stats" :key="stat.label" cols="6" md="3">
        <v-card rounded="xl" class="pa-5" color="surface" elevation="2">
          <div class="d-flex align-center justify-space-between">
            <div>
              <p class="text-body-2 text-medium-emphasis mb-1">{{ stat.label }}</p>
              <p class="text-h4 font-weight-bold">{{ stat.value }}</p>
            </div>
            <v-avatar :color="stat.color" size="48" rounded="lg">
              <v-icon color="white">{{ stat.icon }}</v-icon>
            </v-avatar>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Recent Tenants -->
    <v-card rounded="xl" color="surface" elevation="2">
      <v-card-title class="d-flex align-center pa-5">
        <v-icon class="mr-2" color="primary">mdi-domain</v-icon>
        Tenants gần đây
        <v-spacer />
        <v-btn color="primary" variant="tonal" size="small" to="/tenants">Xem tất cả</v-btn>
      </v-card-title>
      <v-table density="comfortable" hover>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Subdomain</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Users</th>
            <th>Zalo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in recentTenants" :key="t.id" style="cursor:pointer" @click="$router.push(`/tenants?open=${t.id}`)">
            <td class="font-weight-medium">{{ t.name }}</td>
            <td><code>{{ t.slug }}</code></td>
            <td><v-chip size="x-small" :color="planColor(t.plan)" variant="tonal">{{ t.plan }}</v-chip></td>
            <td><v-chip size="x-small" :color="statusColor(t.status)" variant="flat">{{ t.status }}</v-chip></td>
            <td>{{ t._count?.users ?? '-' }}</td>
            <td>{{ t._count?.zaloAccounts ?? '-' }}</td>
          </tr>
          <tr v-if="!recentTenants.length">
            <td colspan="6" class="text-center text-medium-emphasis py-8">Chưa có tenant nào</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';

const stats = ref([
  { label: 'Tổng Tenants', value: 0, icon: 'mdi-domain', color: 'primary' },
  { label: 'Active', value: 0, icon: 'mdi-check-circle', color: 'success' },
  { label: 'Tổng Users', value: 0, icon: 'mdi-account-group', color: 'info' },
  { label: 'Tổng Zalo', value: 0, icon: 'mdi-message-text', color: 'warning' },
]);

const recentTenants = ref<any[]>([]);

onMounted(async () => {
  try {
    const [statsRes, tenantsRes] = await Promise.all([
      api.get('/stats'),
      api.get('/tenants'),
    ]);
    const s = statsRes.data;
    stats.value[0].value = s.totalOrgs;
    stats.value[1].value = s.activeOrgs;
    stats.value[2].value = s.totalUsers;
    stats.value[3].value = s.totalZalo;
    recentTenants.value = (tenantsRes.data.tenants || []).slice(0, 10);
  } catch {}
});

function planColor(plan: string) {
  if (plan.includes('enterprise')) return 'purple';
  if (plan.includes('pro')) return 'info';
  if (plan.includes('basic')) return 'success';
  return 'grey';
}
function statusColor(status: string) {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'error';
  return 'warning';
}
</script>
