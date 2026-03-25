import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateAnalysisRequest, Analysis, AnalysisResponse } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function useAnalysis(id: number) {
  return useQuery({
    queryKey: [api.analysis.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.analysis.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch analysis");
      // The shared schema defines the response type, Zod parsing ensures runtime safety
      const data = await res.json();
      return api.analysis.get.responses[200].parse(data) as AnalysisResponse;
    },
    enabled: !!id,
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: [api.analysis.list.path],
    queryFn: async () => {
      const res = await fetch(api.analysis.list.path);
      if (!res.ok) throw new Error("Failed to fetch analyses");
      return api.analysis.list.responses[200].parse(await res.json()) as AnalysisResponse[];
    },
  });
}

export function useCreateAnalysis() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (data: CreateAnalysisRequest) => {
      const res = await fetch(api.analysis.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate analysis");
      }

      return api.analysis.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.analysis.list.path] });
      toast({
        title: "Analysis Generated",
        description: `Successfully analyzed ${data.companyName}`,
      });
      setLocation(`/analyze/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
