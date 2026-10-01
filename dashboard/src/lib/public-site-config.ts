export type DeploymentEnvironment = "development" | "preview" | "production";

export interface PublicSiteConfig {
  readonly deploymentEnvironment: DeploymentEnvironment;
  readonly siteUrl: string | null;
  readonly indexable: boolean;
}

interface PublicSiteConfigInput {
  readonly deploymentEnvironment?: string;
  readonly siteUrl?: string;
}
const DEPLOYMENT_ENVIRONMENTS: Record<DeploymentEnvironment, true> = {
  development: true,
  preview: true,
  production: true,
};

function parseDeploymentEnvironment(value?: string): DeploymentEnvironment {
  const candidate = value?.trim() || "development";
  if (DEPLOYMENT_ENVIRONMENTS[candidate as DeploymentEnvironment] !== true) {
    throw new Error(
      `VITE_DEPLOYMENT_ENV must be development, preview, or production; received ${candidate}`,
    );
  }
  return candidate as DeploymentEnvironment;
}

function parseSiteUrl(value?: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("VITE_SITE_URL must be an absolute http(s) origin");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("VITE_SITE_URL must be an absolute http(s) origin without a path, query, or fragment");
  }

  return parsed.origin;
}

export function getPublicSiteConfig(input: PublicSiteConfigInput): PublicSiteConfig {
  const deploymentEnvironment = parseDeploymentEnvironment(input.deploymentEnvironment);
  const siteUrl = parseSiteUrl(input.siteUrl);

  if (deploymentEnvironment === "production" && siteUrl === null) {
    throw new Error("VITE_SITE_URL is required when VITE_DEPLOYMENT_ENV=production");
  }

  return {
    deploymentEnvironment,
    siteUrl,
    indexable: deploymentEnvironment === "production",
  };
}
