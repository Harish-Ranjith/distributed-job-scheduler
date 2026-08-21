import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useStore } from '../store/index.js';
import type { LoginInput } from '@job-scheduler/shared';

export function useAuth() {
  const queryClient = useQueryClient();
  const setAuth = useStore((state) => state.setAuth);

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const data = await api.get('/auth/me');
      setAuth(data);
      return data;
    },
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginInput) => {
      const data = await api.post('/auth/login', credentials);
      localStorage.setItem('token', data.token);
      setAuth(data.user);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const logout = () => {
    localStorage.removeItem('token');
    setAuth(null);
    queryClient.clear();
  };

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    logout,
  };
}
