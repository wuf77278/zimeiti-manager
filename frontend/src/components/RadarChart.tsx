import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { RadarChart as EChartsRadar } from "echarts/charts";
import {
  TooltipComponent,
  RadarComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { getDimensionConfig, type PlatformKey } from "../config/platforms";

echarts.use([EChartsRadar, TooltipComponent, RadarComponent, CanvasRenderer]);

interface Props {
  data: Record<string, number>;
  platform?: PlatformKey;
}

export default function RadarChart({ data, platform }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  const dimensions = useMemo(() => getDimensionConfig(platform), [platform]);
  const indicators = useMemo(() => dimensions.map((dim) => ({
    name: dim.label,
    max: 100,
  })), [dimensions]);
  const values = useMemo(() => dimensions.map((dim) => data[dim.key] ?? 50), [data, dimensions]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }
    instanceRef.current.setOption({
      animationDuration: 1200,
      radar: {
        indicator: indicators,
        shape: "polygon" as const,
        splitNumber: 4,
        radius: "65%",
        axisName: { color: "#262626", fontSize: 12, fontWeight: 600 },
        splitLine: { lineStyle: { color: "#f0f0f0" } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: "#e8e8e8" } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: values,
              areaStyle: { color: "rgba(255,36,66,0.15)" },
              lineStyle: { color: "#ff2442", width: 2 },
              itemStyle: { color: "#ff2442", borderColor: "#fff", borderWidth: 2 },
              symbol: "circle",
              symbolSize: 6,
            },
          ],
        },
      ],
      tooltip: {
        trigger: "item",
        backgroundColor: "#fff",
        borderColor: "#f0f0f0",
        textStyle: { color: "#262626", fontSize: 13 },
      },
    });
  }, [indicators, values]);

  useEffect(() => {
    const handleResize = () => instanceRef.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      instanceRef.current?.dispose();
    };
  }, []);

  return <div ref={chartRef} style={{ height: 280, width: "100%" }} />;
}
