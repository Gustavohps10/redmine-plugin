import { describe, expect, it } from "vitest";

import { RedmineClient } from "../src/client/RedmineClient";
import { RedmineTimeEntryProvider } from "../src/datasource";
import timeEntriesFixture from "./fixtures/time_entries.json";
import { MockHttpClient } from "./helpers/MockHttpClient";

describe("RedmineTimeEntryProvider", () => {
  it("deve realizar pull de time entries calculando startDate e endDate com precisão UTC", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries.json", 200, timeEntriesFixture);

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.pull(
      "1",
      { updatedAt: new Date(0), id: "0" },
      50,
    );

    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success.items.length).toBe(2);
      const firstEntry = result.success.items[0];
      expect(firstEntry.id).toBe("501");
      expect(firstEntry.task.id).toBe("101");
      expect(firstEntry.activity.id).toBe("9");
      expect(firstEntry.activity.name).toBe("Desenvolvimento");
      expect(firstEntry.user.id).toBe("1");
      expect(firstEntry.timeSpent).toBe(2.5);
      expect(firstEntry.comments).toBe(
        "Análise da requisição e reprodução do bug",
      );
      expect(firstEntry.startDate).toBeDefined();
      expect(firstEntry.endDate).toBeDefined();
    }
  });

  it("deve buscar time entries por intervalo de datas via findByMemberId", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries.json", 200, timeEntriesFixture);

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const startDate = new Date("2026-09-01");
    const endDate = new Date("2026-09-30");

    const result = await provider.findByMemberId("1", startDate, endDate);

    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success.items.length).toBe(2);
      expect(result.success.total).toBe(2);
      expect(result.success.page).toBe(1);
    }
  });

  it("deve buscar apontamento por ID via findById", async () => {
    const httpClient = new MockHttpClient();
    const singleEntryFixture = {
      time_entry: timeEntriesFixture.time_entries[0],
    };
    httpClient.setRoute(
      "GET",
      "/time_entries/501.json",
      200,
      singleEntryFixture,
    );

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.findById("501");
    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success).not.toBeNull();
      expect(result.success?.id).toBe("501");
      expect(result.success?.timeSpent).toBe(2.5);
    }
  });

  it("deve retornar null em findById quando apontamento não for encontrado (404)", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries/9999.json", 404, {}, "NOT_FOUND");

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.findById("9999");
    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success).toBeNull();
    }
  });

  it("deve criar novo apontamento via create", async () => {
    const httpClient = new MockHttpClient();
    const createdResponse = {
      time_entry: {
        id: 777,
        project: { id: 1, name: "Projeto Alpha" },
        issue: { id: 101 },
        user: { id: 1, name: "Redmine Admin" },
        activity: { id: 9, name: "Desenvolvimento" },
        hours: 3.5,
        spent_on: "2026-09-25",
        created_on: "2026-09-25T15:00:00Z",
        updated_on: "2026-09-25T15:00:00Z",
      },
    };
    httpClient.setRoute("POST", "/time_entries.json", 201, createdResponse);

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });
    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.create({
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 3.5,
      comments: "Implementação de feature",
      startDate: new Date("2026-09-25T10:00:00Z"),
      createdAt: new Date("2026-09-25T10:00:00Z"),
      updatedAt: new Date("2026-09-25T10:00:00Z"),
    });

    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success.id).toBe("777");
      expect(result.success.updatedAt).toBeDefined();
    }
  });

  it("deve gravar o marcador sem repetir a consulta que pertence ao serviço", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries.json", 200, {
      time_entries: [],
      total_count: 0,
      offset: 0,
      limit: 100,
    });
    httpClient.setRoute("POST", "/time_entries.json", 201, {
      time_entry: {
        id: 778,
        project: { id: 1, name: "Projeto Alpha" },
        issue: { id: 101 },
        user: { id: 1, name: "Redmine Admin" },
        activity: { id: 9, name: "Desenvolvimento" },
        hours: 3,
        spent_on: "2026-09-25",
        created_on: "2026-09-25T15:00:00Z",
        updated_on: "2026-09-25T15:00:00Z",
      },
    });
    const provider = new RedmineTimeEntryProvider(
      new RedmineClient(httpClient, {
        apiUrl: "https://redmine.test",
        apiKey: "test-key",
      }),
    );

    const result = await provider.create({
      correlationId: "local-entry-uuid",
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 3,
      comments: "Implementação de feature",
      startDate: new Date(2026, 8, 25, 10),
      createdAt: new Date(2026, 8, 25, 10),
      updatedAt: new Date(2026, 8, 25, 10),
    });

    expect(result.isSuccess()).toBe(true);
    expect(httpClient.requests.map((request) => request.method)).toEqual([
      "POST",
    ]);
    const createRequest = httpClient.requests.find(
      (request) => request.method === "POST",
    );
    expect(createRequest?.body).toEqual({
      time_entry: {
        issue_id: 101,
        activity_id: 9,
        hours: 3,
        comments: "Implementação de feature [mc:local-entry-uuid]",
        spent_on: expect.any(String),
        user_id: 1,
      },
    });
  });

  it("deve devolver o apontamento existente pela correlação sem enviar outro POST", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries.json", 200, {
      time_entries: [
        {
          id: 779,
          project: { id: 1, name: "Projeto Alpha" },
          issue: { id: 101 },
          user: { id: 1, name: "Redmine Admin" },
          activity: { id: 9, name: "Desenvolvimento" },
          hours: 3,
          comments: "Implementação [mc:local-entry-uuid]",
          spent_on: "2026-09-25",
          created_on: "2026-09-25T15:00:00Z",
          updated_on: "2026-09-25T16:00:00Z",
        },
      ],
      total_count: 1,
      offset: 0,
      limit: 100,
    });
    const provider = new RedmineTimeEntryProvider(
      new RedmineClient(httpClient, {
        apiUrl: "https://redmine.test",
        apiKey: "test-key",
      }),
    );
    const entry = {
      correlationId: "local-entry-uuid",
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 3,
      comments: "Implementação",
      startDate: new Date(2026, 8, 25, 10),
      createdAt: new Date(2026, 8, 25, 10),
      updatedAt: new Date(2026, 8, 25, 10),
    };

    const result = await provider.findByCorrelation("local-entry-uuid", entry);

    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) expect(result.success?.id).toBe("779");
    expect(httpClient.requests.map((request) => request.method)).toEqual([
      "GET",
    ]);
  });

  it("deve localizar a correlação paginando e remover o marcador do DTO", async () => {
    const httpClient = new MockHttpClient();
    const firstPageParams = {
      user_id: "1",
      issue_id: "101",
      from: "2026-09-24",
      to: "2026-09-26",
      limit: "100",
      offset: "0",
    };
    const secondPageParams = {
      ...firstPageParams,
      offset: "100",
    };
    const nonMatchingEntries = Array.from({ length: 100 }, (value, index) => ({
      ...timeEntriesFixture.time_entries[0],
      id: index + 1,
      comments: "Registro sem correlação",
    }));
    httpClient.setRoute(
      "GET",
      "/time_entries.json",
      200,
      {
        time_entries: nonMatchingEntries,
        total_count: 101,
        offset: 0,
        limit: 100,
      },
      undefined,
      firstPageParams,
    );
    httpClient.setRoute(
      "GET",
      "/time_entries.json",
      200,
      {
        time_entries: [
          {
            id: 780,
            project: { id: 1, name: "Projeto Alpha" },
            issue: { id: 101 },
            user: { id: 1, name: "Redmine Admin" },
            activity: { id: 9, name: "Desenvolvimento" },
            hours: 3,
            comments: "Implementação [mc:local-entry-uuid]",
            spent_on: "2026-09-25",
            created_on: "2026-09-25T15:00:00Z",
            updated_on: "2026-09-25T16:00:00Z",
          },
        ],
        total_count: 101,
        offset: 100,
        limit: 100,
      },
      undefined,
      secondPageParams,
    );
    const provider = new RedmineTimeEntryProvider(
      new RedmineClient(httpClient, {
        apiUrl: "https://redmine.test",
        apiKey: "test-key",
      }),
    );

    const result = await provider.findByCorrelation("local-entry-uuid", {
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 3,
      startDate: new Date(2026, 8, 25, 10),
      createdAt: new Date(2026, 8, 25, 10),
      updatedAt: new Date(2026, 8, 25, 10),
    });

    expect(result.isSuccess()).toBe(true);
    if (result.isSuccess()) {
      expect(result.success?.id).toBe("780");
      expect(result.success?.correlationId).toBe("local-entry-uuid");
      expect(result.success?.comments).toBe("Implementação");
    }
    expect(
      httpClient.requests.map((request) => request.params?.offset),
    ).toEqual(["0", "100"]);
  });

  it("deve falhar quando encontra mais de um apontamento com a mesma correlação", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("GET", "/time_entries.json", 200, {
      time_entries: [
        {
          ...timeEntriesFixture.time_entries[0],
          id: 781,
          comments: "Primeiro [mc:local-entry-uuid]",
        },
        {
          ...timeEntriesFixture.time_entries[0],
          id: 782,
          comments: "Segundo [mc:local-entry-uuid]",
        },
      ],
      total_count: 2,
      offset: 0,
      limit: 100,
    });
    const provider = new RedmineTimeEntryProvider(
      new RedmineClient(httpClient, {
        apiUrl: "https://redmine.test",
        apiKey: "test-key",
      }),
    );

    const result = await provider.findByCorrelation("local-entry-uuid", {
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 3,
      startDate: new Date(2026, 8, 25, 10),
      createdAt: new Date(2026, 8, 25, 10),
      updatedAt: new Date(2026, 8, 25, 10),
    });

    expect(result.isFailure()).toBe(true);
    if (result.isFailure())
      expect(result.failure.messageKey).toBe(
        "DUPLICATE_TIME_ENTRY_CORRELATION",
      );
  });

  it("não deve consultar Redmine com UUID como ID remoto", async () => {
    const httpClient = new MockHttpClient();
    const provider = new RedmineTimeEntryProvider(
      new RedmineClient(httpClient, {
        apiUrl: "https://redmine.test",
        apiKey: "test-key",
      }),
    );

    const result = await provider.findById(
      "12ab34cd-56ef-4789-8abc-def012345678",
    );

    expect(result.isFailure()).toBe(true);
    expect(httpClient.requests).toHaveLength(0);
  });

  it("deve atualizar apontamento existente via update", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("PUT", "/time_entries/501.json", 200, {});
    httpClient.setRoute("GET", "/time_entries/501.json", 200, {
      time_entry: {
        ...timeEntriesFixture.time_entries[0],
        updated_on: "2026-10-01T12:34:56Z",
      },
    });

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.update({
      id: "501",
      task: { id: "101" },
      activity: { id: "9" },
      user: { id: "1" },
      timeSpent: 4.0,
      comments: "Tempo revisado",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.isSuccess()).toBe(true);
    if (result.isFailure()) return;
    expect(result.success).toEqual({ id: "501" });
    expect(httpClient.requests.map((request) => request.method)).toEqual(["PUT"]);
  });

  it("deve excluir apontamento via delete", async () => {
    const httpClient = new MockHttpClient();
    httpClient.setRoute("DELETE", "/time_entries/501.json", 200, {});

    const client = new RedmineClient(httpClient, {
      apiUrl: "https://redmine.test",
      apiKey: "test-key",
    });

    const provider = new RedmineTimeEntryProvider(client);

    const result = await provider.delete("501");
    expect(result.isSuccess()).toBe(true);
  });
});

describe("Canonical Redmine writes", () => {
  const stored = {
    id: 501, project: {id: 1, name: "Project"}, issue: {id: 101},
    user: {id: 1, name: "User"}, activity: {id: 9, name: "Development"},
    hours: 1.33, comments: "saved [mc:local-uuid]", spent_on: "2026-09-24",
    created_on: "2026-09-24T11:00:05Z", updated_on: "2026-09-24T11:00:05Z",
  };
  const entry = {
    id: "501", correlationId: "local-uuid", task: {id: "101"}, activity: {id: "9"}, user: {id: "1"},
    timeSpent: 1.3333, comments: "typed", startDate: new Date(2026, 8, 24, 8),
    createdAt: new Date("2026-09-24T11:00:00Z"), updatedAt: new Date("2026-09-24T11:00:00Z"),
  };
  function setup() {
    const http = new MockHttpClient();
    const provider = new RedmineTimeEntryProvider(new RedmineClient(http, {apiUrl: "https://redmine.test", apiKey: "test-key"}));
    return {http, provider};
  }

  it("returns the actual POST state including rounded hours, dates, comments and server version", async () => {
    const {http, provider} = setup();
    http.setRoute("POST", "/time_entries.json", 201, {time_entry: stored});
    const result = await provider.create(entry);
    expect(result.isSuccess()).toBe(true);
    expect(result.success.entry).toMatchObject({id: "501", timeSpent: 1.33, comments: "saved", correlationId: "local-uuid", startDate: new Date(2026, 8, 24, 12)});
    expect(result.success.entry?.updatedAt).toEqual(new Date(stored.updated_on));
    expect(result.success.entry?.endDate).toEqual(new Date(new Date(2026, 8, 24, 12).getTime() + 1.33 * 3600000));
    expect(http.requests).toHaveLength(1);
  });

  it("confirms PUT before reading the canonical state through findById", async () => {
    const {http, provider} = setup();
    http.setRoute("PUT", "/time_entries/501.json", 204, {});
    http.setRoute("GET", "/time_entries/501.json", 200, {time_entry: stored});
    expect((await provider.update(entry)).success).toEqual({id: "501"});
    expect(http.requests.map((request) => request.method)).toEqual(["PUT"]);
    expect((await provider.findById("501")).success).toMatchObject({timeSpent: 1.33, comments: "saved"});
    expect(http.requests.map((request) => request.method)).toEqual(["PUT", "GET"]);
  });

  it("keeps the local calendar day for an evening entry near UTC midnight", async () => {
    const {http, provider} = setup();
    http.setRoute("POST", "/time_entries.json", 201, {time_entry: stored});
    await provider.create({...entry, startDate: new Date(2026, 8, 24, 23, 59)});
    expect(http.requests.find((request) => request.method === "POST")?.body).toMatchObject({time_entry: {spent_on: "2026-09-24"}});
  });

  it("rejects oversized comments including the marker before making any HTTP request", async () => {
    const {http, provider} = setup();
    const longEntry = {...entry, comments: "x".repeat(1024)};
    expect((await provider.create(longEntry)).failure.messageKey).toBe("REDMINE_TIME_ENTRY_COMMENTS_TOO_LONG");
    expect((await provider.update(longEntry)).failure.messageKey).toBe("REDMINE_TIME_ENTRY_COMMENTS_TOO_LONG");
    expect(http.requests).toHaveLength(0);
  });

  it("accepts the exact comment boundary without truncating user text", async () => {
    const {http, provider} = setup();
    const comments = "x".repeat(1024 - " [mc:local-uuid]".length);
    http.setRoute("POST", "/time_entries.json", 201, {time_entry: stored});
    expect((await provider.create({...entry, comments})).isSuccess()).toBe(true);
    expect(http.requests.find((request) => request.method === "POST")?.body).toMatchObject({time_entry: {comments: `${comments} [mc:local-uuid]`}});
  });

  it("keeps empty comments clear while restoring the correlation marker on update", async () => {
    const {http, provider} = setup();
    http.setRoute("PUT", "/time_entries/501.json", 204, {});
    http.setRoute("GET", "/time_entries/501.json", 200, {time_entry: stored});
    await provider.update({...entry, comments: undefined});
    expect(http.requests.find((request) => request.method === "PUT")?.body).toMatchObject({time_entry: {comments: "[mc:local-uuid]"}});
  });

  it("forwards lookup permission errors exactly and uses user and issue filters", async () => {
    const {http, provider} = setup();
    http.setRoute("GET", "/time_entries.json", 403, {}, "FORBIDDEN_BY_REDMINE");
    const result = await provider.findByCorrelation("local-uuid", entry);
    expect(result.failure.messageKey).toBe("FORBIDDEN_BY_REDMINE");
    expect(http.requests.find((request) => request.method === "GET")?.params).toMatchObject({user_id: "1", issue_id: "101"});
  });
});
