import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function MetricCard({ title, value, subValue, icon, trend, className }: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden border-none shadow-md hover:shadow-lg transition-all duration-300", className)}>
      <CardContent className="p-4 flex items-center gap-4">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate mb-0.5">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
            {subValue && (
              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", 
                trend === "up" ? "text-green-600 bg-green-50" : 
                trend === "down" ? "text-red-600 bg-red-50" : "text-muted-foreground bg-slate-50"
              )}>
                {subValue}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
