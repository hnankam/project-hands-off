"""
Account Billing Tools

This module provides tools for downloading and analyzing account-level billable
usage logs. These are account-level operations that require AccountClient authentication.
"""

from typing import Optional
from cache import get_account_client
from models import BillableUsageDownloadResponse


def download_billable_usage(
    host_credential_key: str,
    account_id_credential_key: str,
    token_credential_key: str,
    start_month: str,
    end_month: str,
    personal_data: Optional[bool] = False,
) -> BillableUsageDownloadResponse:
    """
    Download billable usage logs in CSV format.
    
    Downloads billable usage logs for the specified account and date range.
    Returns data in CSV format containing detailed usage information for all
    workspaces in the account.
    
    Args:
        host_credential_key: Credential key for account console URL (e.g., "https://accounts.cloud.databricks.com")
        account_id_credential_key: Credential key for Databricks account ID
        token: Authentication token (PAT or OAuth token)
        start_month: Start month in YYYY-MM format (e.g., "2024-08")
        end_month: End month in YYYY-MM format (e.g., "2024-09")
        personal_data: Whether to include personally identifiable information
                       like email addresses (default: False)
    
    Returns:
        BillableUsageDownloadResponse with CSV content and metadata
    
    
    
    Notes:
        - This method may take several minutes to complete for large date ranges
        - Billable usage logs are unavailable before March 2019 (2019-03)
        - For narrow date ranges if experiencing timeouts
        - CSV schema varies by cloud provider (AWS vs GCP vs Azure)
        - Handle personal_data=True responses with care (contains PII)
    
    CSV Schema (common fields):
        - account_id_credential_key: Credential key for Databricks account ID
        - workspace_id: Workspace identifier
        - sku_name: SKU/product name
        - cloud: Cloud provider (AWS, Azure, GCP)
        - usage_start_time: Usage period start
        - usage_end_time: Usage period end
        - usage_date: Date of usage
        - custom_tags: Custom tags for cost allocation
        - usage_unit: Unit of measure
        - usage_quantity: Amount of usage
        - record_id: Unique record identifier
        - account_name: Account name
        - workspace_name: Workspace name
        - pricing_plan_version: Pricing plan version
        
    Personal Data Fields (when personal_data=True):
        - user_email: Email of the user who triggered usage
        - cluster_creator_email: Email of cluster creator
        - job_creator_email: Email of job creator
    """
    try:
    client = get_account_client(host_credential_key, account_id_credential_key, token_credential_key)
    
    # Download billable usage (returns DownloadResponse with CSV content)
    response = client.billable_usage.download(
        start_month=start_month,
        end_month=end_month,
        personal_data=personal_data,
    )
    
    # Extract CSV content from response
    # The SDK returns a DownloadResponse object with a 'contents' field
    csv_content = response.contents if hasattr(response, 'contents') else str(response)
    
    return BillableUsageDownloadResponse(
        csv_content=csv_content,
        start_month=start_month,
        end_month=end_month,
    )
    except Exception as e:
        return BillableUsageDownloadResponse(
            csv_content=None,
            start_month=start_month,
            end_month=end_month,
            error_message=f"Failed to download billable usage for {start_month} to {end_month}: {str(e)}",
        )

