import type { CheerioAPI } from "cheerio";

function extract(html: string, cheerioInstance: CheerioAPI) {
  const $ = cheerioInstance.load(html);

  const ideas: {
    title: string;
    link: string;
    symbolInfo: string;
    timeframe: string | null;
    date: string;
  }[] = [];

  $(".tv-feed__item").each((_: any, el: any) => {
    const element = $(el);

    const title = element.find(".tv-widget-idea__title").text().trim();

    const relativeLink = element.find("a.tv-widget-idea__title").attr("href");
    const link = relativeLink
      ? `https://www.tradingview.com${relativeLink}`
      : "";

    const symbolInfo = element.find(".tv-widget-idea__symbol").text().trim();

    let timeframe = null;
    element.find(".tv-widget-idea__timeframe").each((_: any, span: any) => {
      const text = $(span).text().trim();
      if (/^\d+[a-zA-Z]?$/.test(text)) {
        timeframe = text;
        return false; // Exit loop early once timeframe found
      }
    });

    // Convert timeframe if it's a numeric value
    if (timeframe && /^\d+$/.test(timeframe)) {
      const minutes = parseInt(timeframe, 10);
      const MINUTES_IN_HOUR = 60;
      const MINUTES_IN_DAY = 1440;
      const MINUTES_IN_WEEK = 10080;
      const MINUTES_IN_MONTH = 43829; // Approximate average month length in minutes

      if (minutes % MINUTES_IN_MONTH === 0) {
        timeframe = `${minutes / MINUTES_IN_MONTH}M`;
      } else if (minutes % MINUTES_IN_WEEK === 0) {
        timeframe = `${minutes / MINUTES_IN_WEEK}W`;
      } else if (minutes % MINUTES_IN_DAY === 0) {
        timeframe = `${minutes / MINUTES_IN_DAY}D`;
      } else if (minutes % MINUTES_IN_HOUR === 0) {
        timeframe = `${minutes / MINUTES_IN_HOUR}H`;
      } else {
        timeframe = `${minutes}`;
      }
    }

    const date =
      element
        .find(".tv-card-stats__time[data-timestamp]")
        .attr("data-timestamp") ?? "";
    if (link != "" || symbolInfo.includes("XAU")) {
      ideas.push({ title, link, symbolInfo, timeframe, date: date ?? "" });
    }
  });

  // Correctly format output for n8n as individual items
  // return ideas.map(idea => (idea));
  return ideas;
}
