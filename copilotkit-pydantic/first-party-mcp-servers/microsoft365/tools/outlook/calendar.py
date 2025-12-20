"""Outlook calendar operations tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    CalendarEventInfo,
    ListEventsResponse,
    GetEventResponse,
    CreateEventResponse,
    UpdateEventResponse,
    DeleteEventResponse,
)
from typing import List, Optional, Dict, Any


async def list_events(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    start_datetime: Optional[str] = None,
    end_datetime: Optional[str] = None,
    top: int = 25,
) -> ListEventsResponse:
    """
    List calendar events.

    Retrieves calendar events, optionally filtered by date range.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        start_datetime: Optional start datetime (ISO 8601 format)
        end_datetime: Optional end datetime (ISO 8601 format)
        top: Number of events to retrieve (default: 25)

    Returns:
        ListEventsResponse with list of events

    Example:
        response = await list_events(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            start_datetime="2024-01-01T00:00:00Z",
            end_datetime="2024-01-31T23:59:59Z"
        )
        for event in response.events:
            print(f"{event.subject}: {event.start}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get events
        result = await client.users.by_user_id(user_id).events.get()
        
        events = []
        if result and result.value:
            for event in result.value[:top]:
                # Filter by date range if provided
                if start_datetime or end_datetime:
                    event_start = event.start.date_time if event.start else None
                    if start_datetime and event_start and event_start < start_datetime:
                        continue
                    if end_datetime and event_start and event_start > end_datetime:
                        continue
                
                attendees = []
                if event.attendees:
                    for attendee in event.attendees:
                        if attendee.email_address:
                            attendees.append({
                                "name": attendee.email_address.name,
                                "address": attendee.email_address.address,
                                "type": attendee.type.value if attendee.type else "required"
                            })
                
                organizer = None
                if event.organizer and event.organizer.email_address:
                    organizer = {
                        "name": event.organizer.email_address.name,
                        "address": event.organizer.email_address.address
                    }
                
                events.append(CalendarEventInfo(
                    id=event.id,
                    subject=event.subject or "",
                    body_preview=event.body_preview,
                    start={"dateTime": event.start.date_time, "timeZone": event.start.time_zone} if event.start else {},
                    end={"dateTime": event.end.date_time, "timeZone": event.end.time_zone} if event.end else {},
                    location=event.location.display_name if event.location else None,
                    attendees=attendees,
                    organizer=organizer,
                    is_all_day=event.is_all_day or False,
                    is_cancelled=event.is_cancelled or False,
                    web_link=event.web_link,
                ))
        
        return ListEventsResponse(
            events=events,
            total=len(events)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list events: {str(e)}")


async def get_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str,
) -> GetEventResponse:
    """
    Get calendar event details.

    Retrieves full details of a specific event.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        event_id: Event ID

    Returns:
        GetEventResponse with event details

    Example:
        response = await get_event(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            event_id="event-id"
        )
        print(f"Event: {response.event.subject}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get event
        event = await client.users.by_user_id(user_id).events.by_event_id(event_id).get()
        
        attendees = []
        if event.attendees:
            for attendee in event.attendees:
                if attendee.email_address:
                    attendees.append({
                        "name": attendee.email_address.name,
                        "address": attendee.email_address.address,
                        "type": attendee.type.value if attendee.type else "required"
                    })
        
        organizer = None
        if event.organizer and event.organizer.email_address:
            organizer = {
                "name": event.organizer.email_address.name,
                "address": event.organizer.email_address.address
            }
        
        event_info = CalendarEventInfo(
            id=event.id,
            subject=event.subject or "",
            body_preview=event.body_preview,
            start={"dateTime": event.start.date_time, "timeZone": event.start.time_zone} if event.start else {},
            end={"dateTime": event.end.date_time, "timeZone": event.end.time_zone} if event.end else {},
            location=event.location.display_name if event.location else None,
            attendees=attendees,
            organizer=organizer,
            is_all_day=event.is_all_day or False,
            is_cancelled=event.is_cancelled or False,
            web_link=event.web_link,
        )
        
        return GetEventResponse(event=event_info)
    
    except Exception as e:
        raise Exception(f"Failed to get event: {str(e)}")


async def create_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    subject: str,
    start_datetime: str,
    start_timezone: str,
    end_datetime: str,
    end_timezone: str,
    attendees: Optional[List[str]] = None,
    location: Optional[str] = None,
    body: Optional[str] = None,
    is_all_day: bool = False,
) -> CreateEventResponse:
    """
    Create a calendar event.

    Creates a new event in the user's calendar.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        subject: Event subject
        start_datetime: Start datetime (ISO 8601 format)
        start_timezone: Start timezone (e.g., "Pacific Standard Time")
        end_datetime: End datetime (ISO 8601 format)
        end_timezone: End timezone
        attendees: Optional list of attendee email addresses
        location: Optional location
        body: Optional event body/description
        is_all_day: Whether this is an all-day event (default: False)

    Returns:
        CreateEventResponse with created event

    Example:
        response = await create_event(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            subject="Team Meeting",
            start_datetime="2024-01-15T10:00:00",
            start_timezone="Pacific Standard Time",
            end_datetime="2024-01-15T11:00:00",
            end_timezone="Pacific Standard Time",
            attendees=["colleague@company.com"],
            location="Conference Room A"
        )
        print(f"Created: {response.event.subject}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.event import Event
        from msgraph.generated.models.date_time_time_zone import DateTimeTimeZone
        from msgraph.generated.models.item_body import ItemBody
        from msgraph.generated.models.body_type import BodyType
        from msgraph.generated.models.location import Location
        from msgraph.generated.models.attendee import Attendee
        from msgraph.generated.models.email_address import EmailAddress
        from msgraph.generated.models.attendee_type import AttendeeType
        
        # Create event
        event = Event()
        event.subject = subject
        
        # Set start time
        start = DateTimeTimeZone()
        start.date_time = start_datetime
        start.time_zone = start_timezone
        event.start = start
        
        # Set end time
        end = DateTimeTimeZone()
        end.date_time = end_datetime
        end.time_zone = end_timezone
        event.end = end
        
        # Set location if provided
        if location:
            loc = Location()
            loc.display_name = location
            event.location = loc
        
        # Set body if provided
        if body:
            body_obj = ItemBody()
            body_obj.content = body
            body_obj.content_type = BodyType.Html
            event.body = body_obj
        
        # Set attendees if provided
        if attendees:
            attendee_list = []
            for email in attendees:
                attendee = Attendee()
                email_addr = EmailAddress()
                email_addr.address = email
                attendee.email_address = email_addr
                attendee.type = AttendeeType.Required
                attendee_list.append(attendee)
            event.attendees = attendee_list
        
        event.is_all_day = is_all_day
        
        # Create event
        result = await client.users.by_user_id(user_id).events.post(event)
        
        attendee_info = []
        if result.attendees:
            for att in result.attendees:
                if att.email_address:
                    attendee_info.append({
                        "name": att.email_address.name,
                        "address": att.email_address.address,
                        "type": att.type.value if att.type else "required"
                    })
        
        event_info = CalendarEventInfo(
            id=result.id,
            subject=result.subject or "",
            body_preview=result.body_preview,
            start={"dateTime": result.start.date_time, "timeZone": result.start.time_zone} if result.start else {},
            end={"dateTime": result.end.date_time, "timeZone": result.end.time_zone} if result.end else {},
            location=result.location.display_name if result.location else None,
            attendees=attendee_info,
            is_all_day=result.is_all_day or False,
            is_cancelled=False,
            web_link=result.web_link,
        )
        
        return CreateEventResponse(event=event_info)
    
    except Exception as e:
        raise Exception(f"Failed to create event: {str(e)}")


async def update_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str,
    updates: Dict[str, Any],
) -> UpdateEventResponse:
    """
    Update a calendar event.

    Updates fields of an existing event.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        event_id: Event ID to update
        updates: Dictionary of fields to update (subject, location, etc.)

    Returns:
        UpdateEventResponse with updated event

    Example:
        response = await update_event(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            event_id="event-id",
            updates={"subject": "Updated Meeting Title", "location": "Room B"}
        )
        print(f"Updated: {response.event.subject}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.event import Event
        from msgraph.generated.models.location import Location
        
        # Prepare updates
        event = Event()
        
        if "subject" in updates:
            event.subject = updates["subject"]
        
        if "location" in updates:
            loc = Location()
            loc.display_name = updates["location"]
            event.location = loc
        
        # Update event
        result = await client.users.by_user_id(user_id).events.by_event_id(event_id).patch(event)
        
        attendee_info = []
        if result.attendees:
            for att in result.attendees:
                if att.email_address:
                    attendee_info.append({
                        "name": att.email_address.name,
                        "address": att.email_address.address,
                        "type": att.type.value if att.type else "required"
                    })
        
        event_info = CalendarEventInfo(
            id=result.id,
            subject=result.subject or "",
            body_preview=result.body_preview,
            start={"dateTime": result.start.date_time, "timeZone": result.start.time_zone} if result.start else {},
            end={"dateTime": result.end.date_time, "timeZone": result.end.time_zone} if result.end else {},
            location=result.location.display_name if result.location else None,
            attendees=attendee_info,
            is_all_day=result.is_all_day or False,
            is_cancelled=result.is_cancelled or False,
            web_link=result.web_link,
        )
        
        return UpdateEventResponse(event=event_info)
    
    except Exception as e:
        raise Exception(f"Failed to update event: {str(e)}")


async def delete_event(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    event_id: str,
) -> DeleteEventResponse:
    """
    Delete a calendar event.

    Deletes the specified event.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        event_id: Event ID to delete

    Returns:
        DeleteEventResponse with deletion status

    Example:
        response = await delete_event(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            event_id="event-id"
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Delete event
        await client.users.by_user_id(user_id).events.by_event_id(event_id).delete()
        
        return DeleteEventResponse(
            success=True,
            event_id=event_id
        )
    
    except Exception as e:
        raise Exception(f"Failed to delete event: {str(e)}")
