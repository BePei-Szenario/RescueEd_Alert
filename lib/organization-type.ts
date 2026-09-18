export const organizationTypes = ["feuerwehr", "sanitaetsdienst", "thw", "alarmierungsnutzer"] as const;

export type OrganizationType = (typeof organizationTypes)[number];

export const organizationTypeLabels: Record<OrganizationType, string> = {
 feuerwehr: "Feuerwehr",
 sanitaetsdienst: "Sanitätsdienst",
 thw: "THW",
 alarmierungsnutzer: "Alarmierungsnutzer",
};

const activeServiceLabels: Record<OrganizationType, string> = {
 feuerwehr: "Aktiver Feuerwehr-Dienst",
 sanitaetsdienst: "Aktiver Sanitätsdienst",
 thw: "Aktiver THW-Dienst",
 alarmierungsnutzer: "Aktiver Alarmierungsdienst",
};

export function isOrganizationType(value: unknown): value is OrganizationType {
 return typeof value === "string" && organizationTypes.some(type => type === value);
}

export function organizationTypeLabel(value: OrganizationType | null | undefined): string {
 return value ? organizationTypeLabels[value] : "Nicht festgelegt";
}

export function activeServiceLabel(value: OrganizationType | null | undefined): string {
 return value ? activeServiceLabels[value] : "Aktiver Dienst";
}
