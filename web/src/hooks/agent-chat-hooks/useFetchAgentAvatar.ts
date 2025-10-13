import { useEffect, useState } from 'react';

interface AvatarData {
  avatar?: string;
}

export const useFetchAgentAvatar = (agentId: string) => {
  const [data, setData] = useState<AvatarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!agentId) return;

    const fetchAvatar = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/agents/${agentId}`, {
          headers: {
            Authorization: 'Bearer ragflow-lmMmViZTA2ZWExNDExZWY4YTVkMDI0Mm',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.code === 0 && result.data) {
          setData({
            avatar: result.data.avatar || result.data.icon,
          });
        }
      } catch (err) {
        setError(err as Error);
        console.error('Error fetching agent avatar:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatar();
  }, [agentId]);

  return { data, loading, error };
};
