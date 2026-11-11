declare module "xlsx-chart" {
  interface XlsxChartOptions {
    file?: string;
    chart:
      | "column"
      | "bar"
      | "line"
      | "area"
      | "radar"
      | "scatter"
      | "pie";
    titles: string[];
    fields: string[];
    data: Record<string, Record<string, number>>;
    chartTitle?: string;
    templatePath?: string;
    showVal?: boolean;
  }

  class XLSXChart {
    generate(
      options: XlsxChartOptions,
      callback: (error: Error | null, data: Buffer) => void
    ): void;

    writeFile(
      options: XlsxChartOptions,
      callback: (error: Error | null) => void
    ): void;
  }

  export = XLSXChart;
}
