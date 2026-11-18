export interface ComponentInput {
  name: string;
  weight: number;
  maxMarks: number;
}

export const DEFAULT_COMPONENTS = `Class tests, 20, 20
Midterm exam, 30, 100
Final exam, 50, 100`;

// One component per line: "Name, weight %, maximum marks". Weights must total 100.
export function parseComponents(text: string): { components?: ComponentInput[]; error?: string } {
  const components: ComponentInput[] = [];
  for (const raw of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [name, w, m] = raw.split(",").map((x) => x.trim());
    const weight = Number(w);
    const maxMarks = Number(m);
    if (!name || !Number.isInteger(weight) || weight < 1 || weight > 100 || !Number.isInteger(maxMarks) || maxMarks < 1 || maxMarks > 1000)
      return { error: `Line "${raw}": use name, whole-number weight (1-100) and whole-number maximum marks.` };
    components.push({ name, weight, maxMarks });
  }
  if (components.length === 0) return { error: "Add at least one assessment component." };
  if (new Set(components.map((c) => c.name.toLowerCase())).size !== components.length) return { error: "Component names must be different." };
  const total = components.reduce((s, c) => s + c.weight, 0);
  if (total !== 100) return { error: `Component weights must total 100% (they total ${total}%).` };
  return { components };
}
