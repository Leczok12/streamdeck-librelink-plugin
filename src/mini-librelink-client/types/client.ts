export type TrendType =
  | "SingleDown"
  | "FortyFiveDown"
  | "Flat"
  | "FortyFiveUp"
  | "SingleUp"
  | "NotComputable";

export const trendMap: TrendType[] = [
  "NotComputable",
  "SingleDown",
  "FortyFiveDown",
  "Flat",
  "FortyFiveUp",
  "SingleUp",
  "NotComputable",
];

export type LibreCgmData = {
  valueMgdl: number;
  valueMmol: number;
  isHigh: boolean;
  isLow: boolean;
  state: "low" | "ok" | "high";
  trend_name: TrendType;
  trend_value: number;
};
