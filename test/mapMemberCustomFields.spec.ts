import { describe, expect, it } from "vitest";
import { mapMemberCustomFields } from "../src/datasource/versions/3.4/mapMemberCustomFields";

describe("Member custom fields SDK boundary", () => {
  it("preserves scalar values and serializes multiselect values without casts", () => {
    expect(mapMemberCustomFields([{id: 1, name: "scalar", value: "value"}, {id: 2, name: "multi", value: ["one", "two"]}, {id: 3, name: "empty", value: null}]))
      .toEqual([{id: 1, name: "scalar", value: "value"}, {id: 2, name: "multi", value: '["one","two"]'}, {id: 3, name: "empty", value: ""}]);
  });
});
