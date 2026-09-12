import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LearningState } from "./learning";
export async function learningRequest<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/learning${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "学习数据保存失败");
  return result.data;
}
export function useLearning() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["learning"], queryFn: () => learningRequest<LearningState>(), staleTime: 5000, refetchInterval: 30000 });
  const refresh = () => client.invalidateQueries({ queryKey: ["learning"] });
  return { ...query, refresh, setData: (state: LearningState) => client.setQueryData(["learning"], state) };
}
