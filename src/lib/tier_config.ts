export interface TierLimits {
  name: string;
  groqTokenLimit: number;
  photoQueryLimit: number;
  savedFactsLimit: number;
  supermemoryThreshold: number; // Importance threshold for Janitor Node filtering
}

export const TIER_CONFIG: Record<string, TierLimits> = {
  free: {
    name: "Free",
    groqTokenLimit: 0,
    photoQueryLimit: 0,
    savedFactsLimit: 0,
    supermemoryThreshold: 11,
  },
  core: {
    name: "Core",
    groqTokenLimit: 4500000,
    photoQueryLimit: 10,
    savedFactsLimit: 50,
    supermemoryThreshold: 11,
  },
  flux: {
    name: "Flux",
    groqTokenLimit: 8000000,
    photoQueryLimit: 30,
    savedFactsLimit: 100,
    supermemoryThreshold: 9,
  },
  unlocked: {
    name: "Unlocked",
    groqTokenLimit: Infinity,
    photoQueryLimit: 50,
    savedFactsLimit: 400,
    supermemoryThreshold: 6,
  }
};
