/** Integration 2 capability. Existing planner UI and fixture orchestrators do not depend on it. */
export interface PlanningIntentAnalysisPort {
  beginAnalysisFromText(text: string): Promise<void>;
}
