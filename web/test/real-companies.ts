// Trimmed copies of real rows from data/companies.json (stored 19 Nov 2026); only the fields the rules read.
import type { Company, Declaration, InterimFinancials } from '../lib/types.ts';

interface Raw {
  code: string; sector: string; category: string; price: number; eps: number; nav: number; faceValue: number;
  weekHigh52: number; weekLow52: number; paidUpCapital: number;
  years: Array<{ year: number; eps: number | null; pe: number | null }>;
  declarations: Declaration[]; interim: InterimFinancials | null; sponsors: number[];
}

// Price anchors from the stored 260-day series: first day, 63 and 22 trading days back, last day; plus the 20-day average volume.
const ANCHORS: Record<string, [number, number, number, number, number]> = {
  GP: [285.9, 248.5, 238, 226.8, 96049],
  BNIPLC: [44.3, 111, 155.9, 149.6, 178258],
  BRACBANK: [68.6, 62.9, 66.2, 66.5, 1976671],
  DELTALIFE: [75.3, 76.9, 68.2, 67.8, 74802],
  SHEPHERD: [14.5, 15.8, 11.1, 11, 655225],
  TITASGAS: [17.7, 18.9, 17, 21.4, 807700],
  HWAWELLTEX: [45.2, 48.9, 45.2, 47.8, 531134],
};

const RAW: Record<string, Raw> = {
  GP: {"code":"GP","sector":"Telecom","category":"A","price":226.9,"eps":21.9,"nav":41.49,"faceValue":10,"weekHigh52":282,"weekLow52":221.9,"paidUpCapital":13503000220,"years":[{"year":2018,"eps":26.04,"pe":14.11},{"year":2019,"eps":25.56,"pe":11.18},{"year":2020,"eps":27.54,"pe":12.6},{"year":2021,"eps":25.28,"pe":13.83},{"year":2022,"eps":22.29,"pe":12.86},{"year":2023,"eps":24.49,"pe":11.7},{"year":2024,"eps":26.89,"pe":12.02},{"year":2025,"eps":21.9,"pe":11.77}],"declarations":[{"announced":"2026-07-15","cashPct":105,"interim":true,"recordDate":"2026-08-12"},{"announced":"2026-02-03","cashPct":105,"recordDate":"2026-03-03","periodEnd":"2025-12-31","eps":21.9}],"interim":{"periods":{"nine":"202609","q3":"202609","half":"202606","q2":"202606","q1":"202603"},"eps":{"q1":4.9,"q2":5.62,"half":10.52,"q3":5.56,"nine":16.08}},"sponsors":[90,90,90]},
  BNIPLC: {"code":"BNIPLC","sector":"Insurance","category":"A","price":149.6,"eps":4.81,"nav":31.26,"faceValue":10,"weekHigh52":177,"weekLow52":41.7,"paidUpCapital":442500000,"years":[{"year":2018,"eps":2,"pe":8.2},{"year":2019,"eps":2.23,"pe":11.31},{"year":2020,"eps":2.32,"pe":31.69},{"year":2021,"eps":3.23,"pe":42.04},{"year":2022,"eps":4,"pe":14.49},{"year":2023,"eps":4.04,"pe":14.03},{"year":2024,"eps":4.19,"pe":10.27},{"year":2025,"eps":4.81,"pe":9.29}],"declarations":[{"announced":"2026-04-19","recordDate":"2026-05-13"},{"announced":"2026-04-19","cashPct":22,"recordDate":"2025-05-13","periodEnd":"2025-12-31","eps":4.81},{"announced":"2025-04-23","cashPct":20,"recordDate":"2025-05-20","periodEnd":"2024-12-31","eps":4.19}],"interim":{"periods":{"nine":"202609","q3":"202609","half":"202606","q2":"202606","q1":"202603"},"eps":{"q1":1.61,"q2":1.39,"half":3,"q3":1.84,"nine":4.84}},"sponsors":[37.97]},
  BRACBANK: {"code":"BRACBANK","sector":"Bank","category":"A","price":66.5,"eps":9.12,"nav":51.56,"faceValue":10,"weekHigh52":89.6,"weekLow52":60.8,"paidUpCapital":22895650920,"years":[{"year":2018,"eps":5.17,"pe":14.06},{"year":2019,"eps":4.01,"pe":14.22},{"year":2020,"eps":3.33,"pe":13.31},{"year":2021,"eps":3.93,"pe":14.09},{"year":2022,"eps":4.02,"pe":9.58},{"year":2023,"eps":4.73,"pe":7.57},{"year":2024,"eps":6.95,"pe":7.05},{"year":2025,"eps":9.12,"pe":6.92}],"declarations":[{"announced":"2026-04-27","cashPct":15,"stockPct":15,"recordDate":"2026-05-17","eps":9.12}],"interim":{"periods":{"nine":"202609","q3":"202609","half":"202606","q2":"202606","q1":"202603"},"eps":{"q1":2.9,"q2":2.55,"half":5.07,"q3":2.63,"nine":7.7}},"sponsors":[46.17,46.17,46.17]},
  DELTALIFE: {"code":"DELTALIFE","sector":"Insurance","category":"A","price":67.8,"eps":0,"nav":0,"faceValue":10,"weekHigh52":89.9,"weekLow52":63.9,"paidUpCapital":1237500000,"years":[{"year":2018,"eps":null,"pe":null},{"year":2019,"eps":null,"pe":null},{"year":2020,"eps":null,"pe":null},{"year":2021,"eps":null,"pe":null},{"year":2022,"eps":null,"pe":null},{"year":2023,"eps":null,"pe":null},{"year":2024,"eps":null,"pe":null},{"year":2025,"eps":null,"pe":null}],"declarations":[{"announced":"2026-05-12","cashPct":35,"recordDate":"2026-06-07","periodEnd":"2025-12-31"},{"announced":"2025-06-02","cashPct":30,"recordDate":"2025-06-30","periodEnd":"2024-12-31"},{"announced":"2024-08-15","cashPct":30,"recordDate":"2024-09-05","periodEnd":"2023-12-31"}],"interim":null,"sponsors":[48.26,48.84,48.84]},
  SHEPHERD: {"code":"SHEPHERD","sector":"Textile","category":"B","price":11,"eps":0.04,"nav":13.41,"faceValue":10,"weekHigh52":18.8,"weekLow52":9.8,"paidUpCapital":1540464730,"years":[{"year":2018,"eps":1.15,"pe":34.6},{"year":2019,"eps":0.9,"pe":42.62},{"year":2020,"eps":-0.15,"pe":null},{"year":2021,"eps":-1.03,"pe":null},{"year":2022,"eps":1.18,"pe":22.41},{"year":2023,"eps":0.39,"pe":61.72},{"year":2024,"eps":-1.51,"pe":null},{"year":2025,"eps":0.04,"pe":433.77}],"declarations":[{"announced":"2026-10-29","noDividend":true,"recordDate":"2026-11-19","periodEnd":"2026-06-30"},{"announced":"2025-10-29","cashPct":1,"recordDate":"2025-11-19","periodEnd":"2025-06-30","eps":0.04}],"interim":{"periods":{"q1":"202609"},"eps":{"q1":-0.08}},"sponsors":[51.48,44.99,44.99]},
  TITASGAS: {"code":"TITASGAS","sector":"FuelPower","category":"B","price":21.7,"eps":-7.8,"nav":90.13,"faceValue":10,"weekHigh52":22.3,"weekLow52":15.1,"paidUpCapital":9892218310,"years":[{"year":2018,"eps":3.43,"pe":11.67},{"year":2019,"eps":4.7,"pe":8.48},{"year":2020,"eps":3.64,"pe":8.17},{"year":2021,"eps":3.5,"pe":10.24},{"year":2022,"eps":3.21,"pe":13.31},{"year":2023,"eps":-1.67,"pe":null},{"year":2024,"eps":-7.52,"pe":null},{"year":2025,"eps":-7.8,"pe":null}],"declarations":[{"announced":"2026-10-27","cashPct":2,"recordDate":"2026-11-17","periodEnd":"2026-06-30"},{"announced":"2025-10-28","cashPct":2,"recordDate":"2025-11-17","periodEnd":"2025-06-30"}],"interim":{"periods":{"q1":"202609"},"eps":{"q1":1.49}},"sponsors":[0,0,0]},
  HWAWELLTEX: {"code":"HWAWELLTEX","sector":"Textile","category":"A","price":47.8,"eps":3.64,"nav":40.16,"faceValue":10,"weekHigh52":52.5,"weekLow52":38.5,"paidUpCapital":560000000,"years":[{"year":2018,"eps":2.27,"pe":17.52},{"year":2019,"eps":2.53,"pe":15.2},{"year":2020,"eps":2.31,"pe":13.48},{"year":2021,"eps":3.01,"pe":14.02},{"year":2022,"eps":4.54,"pe":10.1},{"year":2023,"eps":5.94,"pe":9.99},{"year":2024,"eps":3.19,"pe":13.3},{"year":2025,"eps":3.64,"pe":10.98}],"declarations":[{"announced":"2026-10-27","cashPct":20,"recordDate":"2026-11-25","periodEnd":"2026-06-30"},{"announced":"2025-10-28","cashPct":20,"recordDate":"2025-11-20","periodEnd":"2025-06-30"},{"announced":"2024-10-29","cashPct":20,"recordDate":"2024-11-21","periodEnd":"2024-06-30"},{"announced":"2023-10-29","cashPct":25,"recordDate":"2023-11-19","periodEnd":"2023-06-30"}],"interim":{"periods":{"q1":"202609"},"eps":{"q1":0.66}},"sponsors":[50.83,50.83,50.83]},
};

function realSeries([first, m3, m1, last, volume]: [number, number, number, number, number], n = 260) {
  const at = [0, n - 64, n - 23, n - 1], px = [first, m3, m1, last];
  return Array.from({ length: n }, (_, i) => {
    const k = at.findIndex((a, j) => i >= a && i <= at[j + 1]);
    const price = px[k] + ((px[k + 1] - px[k]) * (i - at[k])) / (at[k + 1] - at[k]);
    return { date: new Date(Date.UTC(2026, 10, 19) - Math.round((n - 1 - i) * 1.5) * 86_400_000).toISOString().slice(0, 10), price: Math.round(price * 100) / 100, volume };
  });
}

export function real(code: keyof typeof RAW, over: Partial<Company> = {}): Company {
  const r = RAW[code];
  return {
    version: 5, code: r.code, name: r.code, sector: r.sector, category: r.category, price: r.price, eps: r.eps, nav: r.nav,
    faceValue: r.faceValue, weekHigh52: r.weekHigh52, weekLow52: r.weekLow52, paidUpCapital: r.paidUpCapital,
    years: r.years, dividends: [2025, 2024, 2023, 2022, 2021].map((year) => ({ year, cash: 10, stock: 0 })),
    events: { declarations: r.declarations, directorTrades: [] }, interim: r.interim,
    sharePattern: r.sponsors.map((sponsor) => ({ sponsor })), series: realSeries(ANCHORS[code]),
    ...over,
  };
}
