"""Job management tools."""

from typing import Any
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.jobs import BaseJob, Run
from cache import get_workspace_client


def list_jobs(host: str, token: str, limit: int = 25) -> list[dict[str, Any]]:
    """
    List all jobs in the workspace.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        limit: Maximum number of jobs to return (default: 25)
    
    Returns:
        List of job objects with job_id, name, creator, etc.
    """
    client = get_workspace_client(host, token)
    
    jobs = []
    for job in client.jobs.list(limit=limit):
        job_dict = {
            "job_id": getattr(job, 'job_id', None),
        }
        
        # Handle settings.name safely
        if hasattr(job, 'settings') and job.settings:
            job_dict["name"] = getattr(job.settings, 'name', None)
        
        # Add other attributes
        for attr in ['created_time', 'creator_user_name', 'run_as_user_name']:
            if hasattr(job, attr):
                job_dict[attr] = getattr(job, attr)
        
        jobs.append(job_dict)
    return jobs


def get_job(host: str, token: str, job_id: int) -> dict[str, Any]:
    """
    Get details of a specific job.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        job_id: ID of the job to retrieve
    
    Returns:
        Job details including settings and configuration
    """
    client = get_workspace_client(host, token)
    job = client.jobs.get(job_id)
    
    return {
        "job_id": job.job_id,
        "name": job.settings.name if job.settings else None,
        "created_time": job.created_time,
        "creator_user_name": job.creator_user_name,
        "settings": str(job.settings)  # Simplified for now
    }


def trigger_job(host: str, token: str, job_id: int, notebook_params: dict[str, Any] | None = None, jar_params: list[str] | None = None) -> dict[str, Any]:
    """
    Trigger a job run.
    
    Args:
        host: Databricks workspace URL
        token: Personal Access Token
        job_id: ID of the job to trigger
        notebook_params: Optional parameters for notebook jobs
        jar_params: Optional parameters for JAR jobs
    
    Returns:
        Run details including run_id, number_in_job, and state
    """
    client = get_workspace_client(host, token)
    
    run_params = {}
    if notebook_params:
        run_params['notebook_params'] = notebook_params
    if jar_params:
        run_params['jar_params'] = jar_params
    
    run = client.jobs.run_now(job_id, **run_params)
    
    return {
        "run_id": run.run_id,
        "number_in_job": run.number_in_job,
        "state": str(run.state) if run.state else None
    }

