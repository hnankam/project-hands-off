"""Excel tools for Microsoft 365 MCP Server."""

from .workbooks import (
    list_workbooks,
    get_workbook,
    list_worksheets,
    get_worksheet,
    create_worksheet,
    delete_worksheet,
)

from .data import (
    read_range,
    write_range,
    read_table,
    write_table,
    create_table,
    list_tables,
)

__all__ = [
    # Workbook/Worksheet operations (6)
    "list_workbooks",
    "get_workbook",
    "list_worksheets",
    "get_worksheet",
    "create_worksheet",
    "delete_worksheet",
    # Data operations (6)
    "read_range",
    "write_range",
    "read_table",
    "write_table",
    "create_table",
    "list_tables",
]

