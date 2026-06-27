// Centralized backend API utility mapping for microservices
const meta = import.meta as any;
export const API_BASE_URL = (meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

/**
 * Returns a fully-qualified URL pointing to the decoupled backend microservice.
 * If VITE_API_BASE_URL is not set, fallback to relative API routing paths.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  // Dynamic guard: If we are in the browser and running locally, in a sandbox,
  // or on an AI Studio preview/development domain (*.run.app), always bypass
  // external API base URLs and use relative routing to communicate with our active server.
  if (typeof window !== "undefined") {
    const hn = window.location.hostname;
    if (
      hn === "localhost" || 
      hn.includes("127.0.0.1") || 
      hn.includes(".run.app") || 
      hn.includes("gitpod") || 
      hn.includes("github")
    ) {
      return cleanPath;
    }
  }
  
  return `${API_BASE_URL}${cleanPath}`;
}
