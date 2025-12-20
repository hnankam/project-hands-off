"""Outlook email operations tools."""

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from cache import get_graph_client
from models import (
    MessageInfo,
    ListMessagesResponse,
    GetMessageResponse,
    SendMessageResponse,
    DeleteMessageResponse,
    MailFolderInfo,
    ListMailFoldersResponse,
    EmailAddress,
)
from typing import List, Optional


async def list_messages(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    folder: str = "inbox",
    top: int = 25,
) -> ListMessagesResponse:
    """
    List email messages from a folder.

    Retrieves messages from the specified mail folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        user_id: User ID or user principal name (email)
        folder: Folder name ("inbox", "sent items", "drafts", etc.)
        top: Number of messages to retrieve (default: 25)

    Returns:
        ListMessagesResponse with list of messages

    Example:
        response = await list_messages(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            user_id="user@company.com",
            folder="inbox",
            top=10
        )
        for msg in response.messages:
            print(f"{msg.subject} from {msg.from_address.address if msg.from_address else 'Unknown'}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get messages
        if folder.lower() == "inbox":
            result = await client.users.by_user_id(user_id).mail_folders.by_mail_folder_id("inbox").messages.get()
        else:
            result = await client.users.by_user_id(user_id).mail_folders.by_mail_folder_id(folder).messages.get()
        
        messages = []
        if result and result.value:
            for msg in result.value[:top]:
                from_addr = None
                if msg.from_property and msg.from_property.email_address:
                    from_addr = EmailAddress(
                        name=msg.from_property.email_address.name,
                        address=msg.from_property.email_address.address or ""
                    )
                
                to_recipients = []
                if msg.to_recipients:
                    for recipient in msg.to_recipients:
                        if recipient.email_address:
                            to_recipients.append(EmailAddress(
                                name=recipient.email_address.name,
                                address=recipient.email_address.address or ""
                            ))
                
                messages.append(MessageInfo(
                    id=msg.id,
                    subject=msg.subject or "",
                    body_preview=msg.body_preview,
                    from_address=from_addr,
                    to_recipients=to_recipients,
                    received_datetime=msg.received_date_time.isoformat() if msg.received_date_time else None,
                    is_read=msg.is_read or False,
                    has_attachments=msg.has_attachments or False,
                    importance=msg.importance.value if msg.importance else "normal",
                    web_link=msg.web_link,
                ))
        
        return ListMessagesResponse(
            messages=messages,
            total=len(messages)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list messages: {str(e)}")


async def get_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
) -> GetMessageResponse:
    """
    Get email message details.

    Retrieves full details of a specific message including body.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        message_id: Message ID

    Returns:
        GetMessageResponse with message details

    Example:
        response = await get_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            message_id="msg-id"
        )
        print(f"Subject: {response.message.subject}")
        print(f"Body: {response.body}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get message
        msg = await client.users.by_user_id(user_id).messages.by_message_id(message_id).get()
        
        from_addr = None
        if msg.from_property and msg.from_property.email_address:
            from_addr = EmailAddress(
                name=msg.from_property.email_address.name,
                address=msg.from_property.email_address.address or ""
            )
        
        to_recipients = []
        if msg.to_recipients:
            for recipient in msg.to_recipients:
                if recipient.email_address:
                    to_recipients.append(EmailAddress(
                        name=recipient.email_address.name,
                        address=recipient.email_address.address or ""
                    ))
        
        message_info = MessageInfo(
            id=msg.id,
            subject=msg.subject or "",
            body_preview=msg.body_preview,
            from_address=from_addr,
            to_recipients=to_recipients,
            received_datetime=msg.received_date_time.isoformat() if msg.received_date_time else None,
            is_read=msg.is_read or False,
            has_attachments=msg.has_attachments or False,
            importance=msg.importance.value if msg.importance else "normal",
            web_link=msg.web_link,
        )
        
        body = msg.body.content if msg.body else None
        
        return GetMessageResponse(
            message=message_info,
            body=body
        )
    
    except Exception as e:
        raise Exception(f"Failed to get message: {str(e)}")


async def send_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    to_recipients: List[str],
    subject: str,
    body: str,
    cc_recipients: Optional[List[str]] = None,
    body_type: str = "html",
) -> SendMessageResponse:
    """
    Send an email message.

    Sends a new email to specified recipients.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        user_id: User ID or user principal name (email)
        to_recipients: List of recipient email addresses
        subject: Email subject
        body: Email body content
        cc_recipients: Optional list of CC recipients
        body_type: Body content type ("text" or "html", default: "html")

    Returns:
        SendMessageResponse with send status

    Example:
        response = await send_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            to_recipients=["user@company.com"],
            subject="Project Update",
            body="<p>Here's the latest update...</p>"
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.users.item.send_mail.send_mail_post_request_body import SendMailPostRequestBody
        from msgraph.generated.models.message import Message
        from msgraph.generated.models.recipient import Recipient
        from msgraph.generated.models.email_address import EmailAddress as GraphEmailAddress
        from msgraph.generated.models.item_body import ItemBody
        from msgraph.generated.models.body_type import BodyType
        
        # Create message
        message = Message()
        message.subject = subject
        
        # Set body
        body_obj = ItemBody()
        body_obj.content = body
        body_obj.content_type = BodyType.Html if body_type.lower() == "html" else BodyType.Text
        message.body = body_obj
        
        # Set recipients
        to_list = []
        for email in to_recipients:
            recipient = Recipient()
            email_addr = GraphEmailAddress()
            email_addr.address = email
            recipient.email_address = email_addr
            to_list.append(recipient)
        message.to_recipients = to_list
        
        # Set CC if provided
        if cc_recipients:
            cc_list = []
            for email in cc_recipients:
                recipient = Recipient()
                email_addr = GraphEmailAddress()
                email_addr.address = email
                recipient.email_address = email_addr
                cc_list.append(recipient)
            message.cc_recipients = cc_list
        
        # Send message
        request_body = SendMailPostRequestBody()
        request_body.message = message
        request_body.save_to_sent_items = True
        
        await client.users.by_user_id(user_id).send_mail.post(request_body)
        
        return SendMessageResponse(
            success=True,
            message_id=None  # Graph API doesn't return ID for sent messages
        )
    
    except Exception as e:
        raise Exception(f"Failed to send message: {str(e)}")


async def reply_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
    body: str,
    body_type: str = "html",
) -> dict:
    """
    Reply to an email message.

    Sends a reply to the specified message.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        message_id: ID of message to reply to
        body: Reply body content
        body_type: Body content type ("text" or "html", default: "html")

    Returns:
        Dictionary with reply status

    Example:
        response = reply_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            message_id="msg-id",
            body="<p>Thanks for your email...</p>"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.users.item.messages.item.reply.reply_post_request_body import ReplyPostRequestBody
        
        # Reply to message
        request_body = ReplyPostRequestBody()
        request_body.comment = body
        
        await client.users.by_user_id(user_id).messages.by_message_id(message_id).reply.post(request_body)
        
        return {
            "success": True,
            "message": "Reply sent successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to reply to message: {str(e)}")


async def forward_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
    to_recipients: List[str],
    body: Optional[str] = None,
) -> dict:
    """
    Forward an email message.

    Forwards the specified message to new recipients.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        message_id: ID of message to forward
        to_recipients: List of recipient email addresses
        body: Optional comment to add

    Returns:
        Dictionary with forward status

    Example:
        response = forward_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            message_id="msg-id",
            to_recipients=["colleague@company.com"],
            body="FYI"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.users.item.messages.item.forward.forward_post_request_body import ForwardPostRequestBody
        from msgraph.generated.models.recipient import Recipient
        from msgraph.generated.models.email_address import EmailAddress as GraphEmailAddress
        
        # Prepare recipients
        to_list = []
        for email in to_recipients:
            recipient = Recipient()
            email_addr = GraphEmailAddress()
            email_addr.address = email
            recipient.email_address = email_addr
            to_list.append(recipient)
        
        # Forward message
        request_body = ForwardPostRequestBody()
        request_body.to_recipients = to_list
        if body:
            request_body.comment = body
        
        await client.users.by_user_id(user_id).messages.by_message_id(message_id).forward.post(request_body)
        
        return {
            "success": True,
            "message": "Message forwarded successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to forward message: {str(e)}")


async def delete_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    message_id: str,
) -> DeleteMessageResponse:
    """
    Delete an email message.

    Deletes the specified message.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        message_id: Message ID to delete

    Returns:
        DeleteMessageResponse with deletion status

    Example:
        response = await delete_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            message_id="msg-id"
        )
        print(response.message)
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Delete message
        await client.users.by_user_id(user_id).messages.by_message_id(message_id).delete()
        
        return DeleteMessageResponse(
            success=True,
            message_id=message_id
        )
    
    except Exception as e:
        raise Exception(f"Failed to delete message: {str(e)}")


async def move_message(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    message_id: str,
    destination_folder_id: str,
) -> dict:
    """
    Move an email message to a folder.

    Moves the specified message to a destination folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        message_id: Message ID to move
        destination_folder_id: Destination folder ID

    Returns:
        Dictionary with move status

    Example:
        response = await move_message(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            message_id="msg-id",
            destination_folder_id="folder-id"
        )
        print(response["message"])
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.users.item.messages.item.move.move_post_request_body import MovePostRequestBody
        
        # Move message
        request_body = MovePostRequestBody()
        request_body.destination_id = destination_folder_id
        
        await client.users.by_user_id(user_id).messages.by_message_id(message_id).move.post(request_body)
        
        return {
            "success": True,
            "message": "Message moved successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to move message: {str(e)}")


async def search_messages(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    query: str,
    top: int = 25,
) -> ListMessagesResponse:
    """
    Search email messages.

    Searches for messages matching the query.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        query: Search query string
        top: Number of results to return (default: 25)

    Returns:
        ListMessagesResponse with matching messages

    Example:
        response = await search_messages(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            query="project update"
        )
        for msg in response.messages:
            print(f"Found: {msg.subject}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Search messages
        result = await client.users.by_user_id(user_id).messages.get()
        
        # Filter by query (basic implementation)
        messages = []
        if result and result.value:
            for msg in result.value:
                # Simple search in subject and body preview
                if query.lower() in (msg.subject or "").lower() or query.lower() in (msg.body_preview or "").lower():
                    from_addr = None
                    if msg.from_property and msg.from_property.email_address:
                        from_addr = EmailAddress(
                            name=msg.from_property.email_address.name,
                            address=msg.from_property.email_address.address or ""
                        )
                    
                    to_recipients = []
                    if msg.to_recipients:
                        for recipient in msg.to_recipients:
                            if recipient.email_address:
                                to_recipients.append(EmailAddress(
                                    name=recipient.email_address.name,
                                    address=recipient.email_address.address or ""
                                ))
                    
                    messages.append(MessageInfo(
                        id=msg.id,
                        subject=msg.subject or "",
                        body_preview=msg.body_preview,
                        from_address=from_addr,
                        to_recipients=to_recipients,
                        received_datetime=msg.received_date_time.isoformat() if msg.received_date_time else None,
                        is_read=msg.is_read or False,
                        has_attachments=msg.has_attachments or False,
                        importance=msg.importance.value if msg.importance else "normal",
                        web_link=msg.web_link,
                    ))
                    
                    if len(messages) >= top:
                        break
        
        return ListMessagesResponse(
            messages=messages,
            total=len(messages)
        )
    
    except Exception as e:
        raise Exception(f"Failed to search messages: {str(e)}")


async def list_mail_folders(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
) -> ListMailFoldersResponse:
    """
    List mail folders.

    Retrieves all mail folders for the user.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret

    Returns:
        ListMailFoldersResponse with list of folders

    Example:
        response = await list_mail_folders(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx"
        )
        for folder in response.folders:
            print(f"{folder.display_name}: {folder.total_item_count} items")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        # Get folders
        result = await client.users.by_user_id(user_id).mail_folders.get()
        
        folders = []
        if result and result.value:
            for folder in result.value:
                folders.append(MailFolderInfo(
                    id=folder.id,
                    display_name=folder.display_name or "",
                    parent_folder_id=folder.parent_folder_id,
                    total_item_count=folder.total_item_count or 0,
                    unread_item_count=folder.unread_item_count or 0,
                ))
        
        return ListMailFoldersResponse(
            folders=folders,
            total=len(folders)
        )
    
    except Exception as e:
        raise Exception(f"Failed to list mail folders: {str(e)}")


async def create_mail_folder(
    tenant_id: str,
    client_id: str,
    client_secret: str,
    user_id: str,
    display_name: str,
    parent_folder_id: Optional[str] = None,
) -> dict:
    """
    Create a mail folder.

    Creates a new mail folder.

    Args:
        tenant_id: Azure AD tenant ID
        client_id: Azure AD application (client) ID
        client_secret: Azure AD application client secret
        display_name: Folder display name
        parent_folder_id: Optional parent folder ID

    Returns:
        Dictionary with created folder details

    Example:
        response = await create_mail_folder(
            tenant_id="xxx",
            client_id="xxx",
            client_secret="xxx",
            display_name="Projects"
        )
        print(f"Created: {response['display_name']}")
    """
    client = get_graph_client(tenant_id, client_id, client_secret)
    
    try:
        from msgraph.generated.models.mail_folder import MailFolder
        
        # Create folder
        folder = MailFolder()
        folder.display_name = display_name
        if parent_folder_id:
            folder.parent_folder_id = parent_folder_id
        
        result = await client.users.by_user_id(user_id).mail_folders.post(folder)
        
        return {
            "id": result.id,
            "display_name": result.display_name or "",
            "parent_folder_id": result.parent_folder_id,
            "message": "Folder created successfully"
        }
    
    except Exception as e:
        raise Exception(f"Failed to create mail folder: {str(e)}")

