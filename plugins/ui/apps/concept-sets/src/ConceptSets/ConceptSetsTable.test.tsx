import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const mockGetText = vi.fn((key: string) => key);

vi.mock("../hooks", () => ({
  useTranslation: () => ({
    getText: mockGetText,
  }),
}));

vi.mock("@portal/components", () => ({
  Button: ({ text, onClick }: { text: string; onClick: () => void }) => (
    <button onClick={onClick}>{text}</button>
  ),
  EditIcon: () => <span>EditIcon</span>,
  IconButton: ({
    startIcon,
    onClick,
  }: {
    startIcon: React.ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{startIcon}</button>,
  VisibilityOnIcon: () => <span>VisibilityOnIcon</span>,
}));

vi.mock("material-react-table", () => ({
  useMaterialReactTable: (config: unknown) => ({
    ...(config as Record<string, unknown>),
    resetPagination: vi.fn(),
  }),
  MaterialReactTable: ({ table }: { table: any }) => (
    <div>
      {table.data.map((row: any) => (
        <div key={row.id} data-testid={`row-${row.id}`}>
          {table.columns
            .filter((column: any) => column.Cell)
            .map((column: any) => (
              <div key={column.id || column.accessorKey}>
                {column.Cell({ row: { original: row } })}
              </div>
            ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./ConceptSets.scss", () => ({}));
vi.mock("@mui/icons-material/Delete", () => ({
  default: () => <span data-testid="DeleteIcon">DeleteIcon</span>,
}));

import { ConceptSetsTable } from "./ConceptSetsTable";

describe("ConceptSetsTable", () => {
  it("renders edit and delete actions for writable legacy concept sets", () => {
    const onAddEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConceptSetsTable
        data={[
          {
            id: "legacy:15",
            externalId: 15,
            source: "legacy",
            name: "Legacy set",
            concepts: [],
            shared: false,
            createdBy: "owner",
            userName: "owner",
            hasWriteAccess: true,
            hasReadAccess: true,
          },
        ]}
        isLoading={false}
        onAddEdit={onAddEdit}
        onDelete={onDelete}
        userName="owner"
      />
    );

    const row = screen.getByTestId("row-legacy:15");
    const buttons = within(row).getAllByRole("button");
    expect(screen.getByText("EditIcon")).toBeTruthy();
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onAddEdit).toHaveBeenCalledWith("legacy:15", true);
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "legacy:15", hasWriteAccess: true })
    );
  });

  it("renders edit and delete actions for writable WebAPI concept sets", () => {
    const onAddEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConceptSetsTable
        data={[
          {
            id: "webapi:7",
            externalId: 7,
            source: "webapi",
            name: "Native set",
            concepts: [],
            shared: false,
            createdBy: "owner",
            userName: "owner",
            hasWriteAccess: true,
            hasReadAccess: true,
          },
        ]}
        isLoading={false}
        onAddEdit={onAddEdit}
        onDelete={onDelete}
        userName="owner"
      />
    );

    const row = screen.getByTestId("row-webapi:7");
    const buttons = within(row).getAllByRole("button");
    expect(screen.getByText("EditIcon")).toBeTruthy();
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onAddEdit).toHaveBeenCalledWith("webapi:7", true);
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "webapi:7", hasWriteAccess: true })
    );
  });

  it("renders legacy source for legacy concept sets", () => {
    const onAddEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConceptSetsTable
        data={[
          {
            id: "legacy:15",
            externalId: 15,
            source: "legacy",
            name: "Legacy set",
            concepts: [],
            shared: false,
            createdBy: "owner",
            userName: "owner",
            hasWriteAccess: true,
            hasReadAccess: true,
          },
        ]}
        isLoading={false}
        onAddEdit={onAddEdit}
        onDelete={onDelete}
        userName="owner"
      />
    );

    expect(screen.getByText("CONCEPT_SETS__LEGACY")).toBeTruthy();
    expect(screen.queryByText("CONCEPT_SETS__WEBAPI")).toBeNull();
  });

  it("renders WebAPI source for native concept sets", () => {
    const onAddEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConceptSetsTable
        data={[
          {
            id: "webapi:7",
            externalId: 7,
            source: "webapi",
            name: "Native set",
            concepts: [],
            shared: false,
            createdBy: "owner",
            userName: "owner",
            hasWriteAccess: true,
            hasReadAccess: true,
          },
        ]}
        isLoading={false}
        onAddEdit={onAddEdit}
        onDelete={onDelete}
        userName="owner"
      />
    );

    expect(screen.getByText("CONCEPT_SETS__WEBAPI")).toBeTruthy();
    expect(screen.queryByText("CONCEPT_SETS__LEGACY")).toBeNull();
  });

  it("renders edit and delete actions for WebAPI concept sets created by current user when hasWriteAccess is false", () => {
    const onAddEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConceptSetsTable
        data={[
          {
            id: "webapi:2",
            externalId: 2,
            source: "webapi",
            name: "Cardiac arrest",
            concepts: [],
            shared: false,
            createdBy: "admin",
            userName: "admin",
            hasWriteAccess: false,
            hasReadAccess: false,
          },
        ]}
        isLoading={false}
        onAddEdit={onAddEdit}
        onDelete={onDelete}
        userName="admin"
      />
    );

    const row = screen.getByTestId("row-webapi:2");
    const buttons = within(row).getAllByRole("button");
    expect(screen.getByText("EditIcon")).toBeTruthy();
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(onAddEdit).toHaveBeenCalledWith("webapi:2", true);
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "webapi:2", hasWriteAccess: false })
    );
  });
});
