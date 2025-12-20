"""SharePoint list management tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    SharePointListInfo,
    ListSharePointListsResponse,
    ListItemInfo,
    ListItemsResponse,
    CreateListItemResponse,
    UpdateListItemResponse,
    DeleteListItemResponse,
)
from typing import Dict, Any


async def list_sharepoint_lists(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
) -> ListSharePointListsResponse:
    """
    List SharePoint lists in a site.

    Retrieves all lists in the specified SharePoint site.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID

    Returns:
        ListSharePointListsResponse with list of lists

    Example:
        response = await list_sharepoint_lists(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456"
        )
        for sp_list in response.lists:
            print(f"{sp_list.name}: {sp_list.web_url}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get lists
        result = await client.sites.by_site_id(site_id).lists.get()
        
        lists = []
        if result and result.value:
            for sp_list in result.value:
                lists.append(SharePointListInfo(
                    id=sp_list.id,
                    name=sp_list.name or "",
                    display_name=sp_list.display_name or sp_list.name or "",
                    web_url=sp_list.web_url or "",
                    description=sp_list.description,
                    template=sp_list.list.template if hasattr(sp_list, "list") and sp_list.list else None,
                ))
        
        return ListSharePointListsResponse(
            lists=lists,
            total=len(lists)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list SharePoint lists: {str(e)}")


async def get_list_items(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
) -> ListItemsResponse:
    """
    Get items from a SharePoint list.

    Retrieves all items from the specified list.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        list_id: List ID

    Returns:
        ListItemsResponse with list items

    Example:
        response = await get_list_items(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            list_id="list-guid"
        )
        for item in response.items:
            print(f"Item {item.id}: {item.fields}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get list items
        result = await client.sites.by_site_id(site_id).lists.by_list_id(list_id).items.get()
        
        items = []
        if result and result.value:
            for item in result.value:
                items.append(ListItemInfo(
                    id=item.id,
                    fields=item.fields.additional_data if hasattr(item, "fields") and item.fields else {},
                    created_datetime=item.created_date_time.isoformat() if hasattr(item, "created_date_time") and item.created_date_time else None,
                    last_modified_datetime=item.last_modified_date_time.isoformat() if hasattr(item, "last_modified_date_time") and item.last_modified_date_time else None,
                ))
        
        return ListItemsResponse(
            items=items,
            total=len(items)
        )
    
    except Exception as e:
        raise Exception(f"Failed to get list items: {str(e)}")


async def create_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    fields: Dict[str, Any],
) -> CreateListItemResponse:
    """
    Create a new item in a SharePoint list.

    Creates a new list item with the specified field values.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        list_id: List ID
        fields: Dictionary of field names and values

    Returns:
        CreateListItemResponse with created item

    Example:
        response = await create_list_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            list_id="list-guid",
            fields={
                "Title": "New Item",
                "Description": "Item description",
                "Status": "Active"
            }
        )
        print(f"Created item: {response.item.id}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.list_item import ListItem
        from msgraph.generated.models.field_value_set import FieldValueSet
        
        # Create list item
        list_item = ListItem()
        field_value_set = FieldValueSet()
        field_value_set.additional_data = fields
        list_item.fields = field_value_set
        
        result = await client.sites.by_site_id(site_id).lists.by_list_id(list_id).items.post(list_item)
        
        item_info = ListItemInfo(
            id=result.id,
            fields=result.fields.additional_data if result.fields else {},
            created_datetime=result.created_date_time.isoformat() if result.created_date_time else None,
            last_modified_datetime=result.last_modified_date_time.isoformat() if result.last_modified_date_time else None,
        )
        
        return CreateListItemResponse(item=item_info)
    
    except Exception as e:
        raise Exception(f"Failed to create list item: {str(e)}")


async def update_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    item_id: str,
    fields: Dict[str, Any],
) -> UpdateListItemResponse:
    """
    Update a SharePoint list item.

    Updates the specified list item with new field values.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        list_id: List ID
        item_id: Item ID
        fields: Dictionary of field names and values to update

    Returns:
        UpdateListItemResponse with updated item

    Example:
        response = await update_list_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            list_id="list-guid",
            item_id="item-id",
            fields={
                "Status": "Completed",
                "CompletionDate": "2024-01-15"
            }
        )
        print(f"Updated item: {response.item.id}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.field_value_set import FieldValueSet
        
        # Update list item fields
        field_value_set = FieldValueSet()
        field_value_set.additional_data = fields
        
        result = await client.sites.by_site_id(site_id).lists.by_list_id(list_id).items.by_list_item_id(item_id).fields.patch(field_value_set)
        
        item_info = ListItemInfo(
            id=item_id,
            fields=result.additional_data if result else fields,
        )
        
        return UpdateListItemResponse(item=item_info)
    
    except Exception as e:
        raise Exception(f"Failed to update list item: {str(e)}")


async def delete_list_item(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    site_id: str,
    list_id: str,
    item_id: str,
) -> DeleteListItemResponse:
    """
    Delete a SharePoint list item.

    Deletes the specified list item.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        site_id: Site ID
        list_id: List ID
        item_id: Item ID to delete

    Returns:
        DeleteListItemResponse with deletion status

    Example:
        response = await delete_list_item(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            site_id="contoso.sharepoint.com,abc123,def456",
            list_id="list-guid",
            item_id="item-id"
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Delete list item
        await client.sites.by_site_id(site_id).lists.by_list_id(list_id).items.by_list_item_id(item_id).delete()
        
        return DeleteListItemResponse(
            success=True,
            item_id=item_id
        )
    
    except Exception as e:
        raise Exception(f"Failed to delete list item: {str(e)}")
