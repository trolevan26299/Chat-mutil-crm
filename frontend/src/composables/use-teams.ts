/**
 * Composable for team management API calls.
 * Provides CRUD operations for teams, member management (N-N), and knowledge base.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface Team {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

export interface TeamKnowledge {
  id: string;
  title: string;
  sourceType: 'text' | 'url' | 'file';
  status: 'pending' | 'indexing' | 'indexed' | 'failed';
  chunkCount: number;
  sourceUrl?: string;
  fileUrl?: string;
  createdAt: string;
}

export function useTeams() {
  const teams = ref<Team[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchTeams() {
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get('/teams');
      teams.value = res.data.teams ?? res.data;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Lỗi tải danh sách đội nhóm';
    } finally {
      loading.value = false;
    }
  }

  async function createTeam(name: string, description?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.post('/teams', { name, description });
      await fetchTeams();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi tạo đội nhóm' };
    }
  }

  async function updateTeam(id: string, name: string, description?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.put(`/teams/${id}`, { name, description });
      await fetchTeams();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi cập nhật đội nhóm' };
    }
  }

  async function deleteTeam(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/teams/${id}`);
      await fetchTeams();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi xóa đội nhóm' };
    }
  }

  // ─── Members (N-N) ───────────────────────────────────────────────────────

  async function fetchMembers(teamId: string): Promise<TeamMember[]> {
    try {
      const res = await api.get(`/teams/${teamId}/members`);
      const raw = res.data.members ?? res.data;
      // New N-N endpoint returns: { id, teamId, userId, role, user: {...} }
      // Old endpoint may return { id, userId, fullName, email, role }
      return raw.map((m: any) => ({
        id: m.id,
        userId: m.userId || m.user?.id,
        fullName: m.fullName || m.user?.fullName,
        email: m.email || m.user?.email,
        role: m.role,
      }));
    } catch {
      return [];
    }
  }

  async function addMember(teamId: string, userId: string, role?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.post(`/teams/${teamId}/members`, { userId, role });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi thêm thành viên' };
    }
  }

  async function removeMember(teamId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/teams/${teamId}/members/${userId}`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi xóa thành viên' };
    }
  }

  // ─── Knowledge Base ───────────────────────────────────────────────────────

  async function fetchKnowledge(teamId: string): Promise<TeamKnowledge[]> {
    try {
      const res = await api.get(`/teams/${teamId}/knowledge`);
      return res.data ?? [];
    } catch {
      return [];
    }
  }

  async function fetchKnowledgeContent(teamId: string, knowledgeId: string): Promise<string> {
    try {
      const res = await api.get(`/teams/${teamId}/knowledge/${knowledgeId}/content`);
      return res.data?.content || '';
    } catch {
      return '';
    }
  }

  async function addKnowledgeText(teamId: string, title: string, content: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.post(`/teams/${teamId}/knowledge`, { title, sourceType: 'text', content });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi thêm tài liệu' };
    }
  }

  async function addKnowledgeUrl(teamId: string, title: string, sourceUrl: string, crawlLimit: number | 'all' = 50): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.post(`/teams/${teamId}/knowledge`, { title, sourceType: 'url', sourceUrl, crawlLimit });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi thêm URL' };
    }
  }

  async function uploadKnowledgeFile(teamId: string, title: string, file: File): Promise<{ ok: boolean; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/teams/${teamId}/knowledge/upload?title=${encodeURIComponent(title)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi upload file' };
    }
  }

  async function deleteKnowledge(teamId: string, knowledgeId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/teams/${teamId}/knowledge/${knowledgeId}`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi xóa tài liệu' };
    }
  }

  async function reindexKnowledge(teamId: string, knowledgeId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.post(`/teams/${teamId}/knowledge/${knowledgeId}/reindex`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi reindex' };
    }
  }

  return {
    teams, loading, error,
    fetchTeams, createTeam, updateTeam, deleteTeam,
    fetchMembers, addMember, removeMember,
    fetchKnowledge, fetchKnowledgeContent, addKnowledgeText, addKnowledgeUrl, uploadKnowledgeFile, deleteKnowledge, reindexKnowledge,
  };
}
