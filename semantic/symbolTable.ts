import type { PromptType } from "./types";

export interface StepInfo {
  name: string;
  inType: PromptType;
  outType: PromptType;
}

export class SymbolTable {
  private steps = new Map<string, StepInfo>();

  
addStep(step: StepInfo): void {
  if (this.steps.has(step.name)) {
    throw new Error(`Step "${step.name}" is already registered.`);
  }

  this.steps.set(step.name, step);
}


  getStep(name: string): StepInfo | undefined {
    return this.steps.get(name);
  }

  hasStep(name: string): boolean {
    return this.steps.has(name);
  }

  getAllSteps(): StepInfo[] {
    return Array.from(this.steps.values());
  }
}