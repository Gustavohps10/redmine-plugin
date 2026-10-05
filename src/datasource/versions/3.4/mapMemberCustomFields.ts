import type { MemberDTO } from "@mr-tick/sdk";

import type { RedmineCustomField } from "../../../types/redmine";

/** The SDK exposes display strings; arrays retain their structure as JSON text. */
export function mapMemberCustomFields(fields: RedmineCustomField[] | undefined): MemberDTO["customFields"] {
  if (!fields) return [];
  return fields.map((field) => {
    if (typeof field.value === "string") return {id: field.id, name: field.name, value: field.value};
    if (Array.isArray(field.value)) return {id: field.id, name: field.name, value: JSON.stringify(field.value)};
    return {id: field.id, name: field.name, value: ""};
  });
}
