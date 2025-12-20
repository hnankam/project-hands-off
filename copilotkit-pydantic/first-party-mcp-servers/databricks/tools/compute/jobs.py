"""
Job Management Tools

This module provides comprehensive job orchestration capabilities including
job CRUD, run management, and permission control.
"""

from typing import Optional, List, Dict, Any
from cache import get_workspace_client
from models import (
    JobInfo,
    JobSettingsInfo,
    JobTaskInfo,
    ListJobsResponse,
    CreateJobResponse,
    UpdateJobResponse,
    DeleteJobResponse,
    RunInfo,
    RunStateInfo,
    RunTaskInfo,
    ListRunsResponse,
    RunNowResponse,
    SubmitRunResponse,
    CancelRunResponse,
    DeleteRunResponse,
    RepairRunResponse,
    RunOutputInfo,
    ExportRunResponse,
    ExportRunView,
)


# ============================================================================
# Job Management
# ============================================================================

def list_jobs(
    host: str,
    token: str,
    limit: Optional[int] = None,
    name: Optional[str] = None,
    expand_tasks: Optional[bool] = None,
    page_token: Optional[str] = None,
) -> ListJobsResponse:
    """
    List jobs in the workspace.
    
    Lists all jobs that the user has access to. Supports filtering by name
    and pagination.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        limit: Maximum number of jobs to return
        name: Filter by job name (exact match)
        expand_tasks: Whether to expand task details
        page_token: Token for pagination
        
    Returns:
        ListJobsResponse with list of jobs
        
    Example:
        # List all jobs
        jobs = list_jobs(host, token)
        
        # List jobs with name filter
        jobs = list_jobs(host, token, name="Daily ETL")
        
        # List with pagination
        jobs = list_jobs(host, token, limit=50, page_token="...")
    """
    client = get_workspace_client(host, token)
    
    jobs_list = []
    iterator = client.jobs.list(
        limit=limit,
        name=name,
        expand_tasks=expand_tasks,
        page_token=page_token,
    )
    
    has_more = False
    for job in iterator:
        # Extract settings
        settings = None
        if job.settings:
            # Convert tasks to JobTaskInfo
            tasks = None
            if hasattr(job.settings, 'tasks') and job.settings.tasks:
                tasks = [
                    JobTaskInfo(
                        task_key=t.task_key,
                        description=getattr(t, 'description', None),
                        depends_on=[dep.as_dict() for dep in getattr(t, 'depends_on', [])] if hasattr(t, 'depends_on') else None,
                        notebook_task=t.notebook_task.as_dict() if hasattr(t, 'notebook_task') and t.notebook_task else None,
                        spark_jar_task=t.spark_jar_task.as_dict() if hasattr(t, 'spark_jar_task') and t.spark_jar_task else None,
                        spark_python_task=t.spark_python_task.as_dict() if hasattr(t, 'spark_python_task') and t.spark_python_task else None,
                        spark_submit_task=t.spark_submit_task.as_dict() if hasattr(t, 'spark_submit_task') and t.spark_submit_task else None,
                        python_wheel_task=t.python_wheel_task.as_dict() if hasattr(t, 'python_wheel_task') and t.python_wheel_task else None,
                        sql_task=t.sql_task.as_dict() if hasattr(t, 'sql_task') and t.sql_task else None,
                        dbt_task=t.dbt_task.as_dict() if hasattr(t, 'dbt_task') and t.dbt_task else None,
                        pipeline_task=t.pipeline_task.as_dict() if hasattr(t, 'pipeline_task') and t.pipeline_task else None,
                        existing_cluster_id=getattr(t, 'existing_cluster_id', None),
                        new_cluster=t.new_cluster.as_dict() if hasattr(t, 'new_cluster') and t.new_cluster else None,
                        timeout_seconds=getattr(t, 'timeout_seconds', None),
                    )
                    for t in job.settings.tasks
                ]
            
            settings = JobSettingsInfo(
                name=getattr(job.settings, 'name', None),
                description=getattr(job.settings, 'description', None),
                tags=getattr(job.settings, 'tags', None),
                tasks=tasks,
                schedule=job.settings.schedule.as_dict() if hasattr(job.settings, 'schedule') and job.settings.schedule else None,
                max_concurrent_runs=getattr(job.settings, 'max_concurrent_runs', None),
                timeout_seconds=getattr(job.settings, 'timeout_seconds', None),
                email_notifications=job.settings.email_notifications.as_dict() if hasattr(job.settings, 'email_notifications') and job.settings.email_notifications else None,
                webhook_notifications=job.settings.webhook_notifications.as_dict() if hasattr(job.settings, 'webhook_notifications') and job.settings.webhook_notifications else None,
                notification_settings=job.settings.notification_settings.as_dict() if hasattr(job.settings, 'notification_settings') and job.settings.notification_settings else None,
                git_source=job.settings.git_source.as_dict() if hasattr(job.settings, 'git_source') and job.settings.git_source else None,
                job_clusters=[jc.as_dict() for jc in job.settings.job_clusters] if hasattr(job.settings, 'job_clusters') and job.settings.job_clusters else None,
                format=getattr(job.settings, 'format', None),
                run_as=job.settings.run_as.as_dict() if hasattr(job.settings, 'run_as') and job.settings.run_as else None,
                parameters=[p.as_dict() for p in job.settings.parameters] if hasattr(job.settings, 'parameters') and job.settings.parameters else None,
            )
        
        jobs_list.append(
            JobInfo(
                job_id=job.job_id,
                name=settings.name if settings else None,
                created_time=job.created_time,
                creator_user_name=job.creator_user_name,
                settings=settings,
                run_as_user_name=getattr(job, 'run_as_user_name', None),
            )
        )
        
        # Check if more jobs exist
        if hasattr(job, 'has_more'):
            has_more = job.has_more
    
    return ListJobsResponse(
        jobs=jobs_list,
        count=len(jobs_list),
        has_more=has_more,
    )


def get_job(
    host: str,
    token: str,
    job_id: int,
) -> JobInfo:
    """
    Get job details.
    
    Returns detailed information about a specific job including all settings
    and task configurations.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID
        
    Returns:
        JobInfo with complete job details
        
    Example:
        job = get_job(host, token, job_id=12345)
        print(f"Job: {job.name}")
        print(f"Tasks: {len(job.settings.tasks) if job.settings else 0}")
    """
    client = get_workspace_client(host, token)
    
    job = client.jobs.get(job_id=job_id)
    
    # Extract settings (same logic as list_jobs)
    settings = None
    if job.settings:
        tasks = None
        if hasattr(job.settings, 'tasks') and job.settings.tasks:
            tasks = [
                JobTaskInfo(
                    task_key=t.task_key,
                    description=getattr(t, 'description', None),
                    depends_on=[dep.as_dict() for dep in getattr(t, 'depends_on', [])] if hasattr(t, 'depends_on') else None,
                    notebook_task=t.notebook_task.as_dict() if hasattr(t, 'notebook_task') and t.notebook_task else None,
                    spark_jar_task=t.spark_jar_task.as_dict() if hasattr(t, 'spark_jar_task') and t.spark_jar_task else None,
                    spark_python_task=t.spark_python_task.as_dict() if hasattr(t, 'spark_python_task') and t.spark_python_task else None,
                    spark_submit_task=t.spark_submit_task.as_dict() if hasattr(t, 'spark_submit_task') and t.spark_submit_task else None,
                    python_wheel_task=t.python_wheel_task.as_dict() if hasattr(t, 'python_wheel_task') and t.python_wheel_task else None,
                    sql_task=t.sql_task.as_dict() if hasattr(t, 'sql_task') and t.sql_task else None,
                    dbt_task=t.dbt_task.as_dict() if hasattr(t, 'dbt_task') and t.dbt_task else None,
                    pipeline_task=t.pipeline_task.as_dict() if hasattr(t, 'pipeline_task') and t.pipeline_task else None,
                    existing_cluster_id=getattr(t, 'existing_cluster_id', None),
                    new_cluster=t.new_cluster.as_dict() if hasattr(t, 'new_cluster') and t.new_cluster else None,
                    timeout_seconds=getattr(t, 'timeout_seconds', None),
                )
                for t in job.settings.tasks
            ]
        
        settings = JobSettingsInfo(
            name=getattr(job.settings, 'name', None),
            description=getattr(job.settings, 'description', None),
            tags=getattr(job.settings, 'tags', None),
            tasks=tasks,
            schedule=job.settings.schedule.as_dict() if hasattr(job.settings, 'schedule') and job.settings.schedule else None,
            max_concurrent_runs=getattr(job.settings, 'max_concurrent_runs', None),
            timeout_seconds=getattr(job.settings, 'timeout_seconds', None),
            email_notifications=job.settings.email_notifications.as_dict() if hasattr(job.settings, 'email_notifications') and job.settings.email_notifications else None,
            webhook_notifications=job.settings.webhook_notifications.as_dict() if hasattr(job.settings, 'webhook_notifications') and job.settings.webhook_notifications else None,
            notification_settings=job.settings.notification_settings.as_dict() if hasattr(job.settings, 'notification_settings') and job.settings.notification_settings else None,
            git_source=job.settings.git_source.as_dict() if hasattr(job.settings, 'git_source') and job.settings.git_source else None,
            job_clusters=[jc.as_dict() for jc in job.settings.job_clusters] if hasattr(job.settings, 'job_clusters') and job.settings.job_clusters else None,
            format=getattr(job.settings, 'format', None),
            run_as=job.settings.run_as.as_dict() if hasattr(job.settings, 'run_as') and job.settings.run_as else None,
            parameters=[p.as_dict() for p in job.settings.parameters] if hasattr(job.settings, 'parameters') and job.settings.parameters else None,
        )
    
    return JobInfo(
        job_id=job.job_id,
        name=settings.name if settings else None,
        created_time=job.created_time,
        creator_user_name=job.creator_user_name,
        settings=settings,
        run_as_user_name=getattr(job, 'run_as_user_name', None),
    )


def create_job(
    host: str,
    token: str,
    name: str,
    tasks: List[Dict[str, Any]],
    schedule: Optional[Dict[str, Any]] = None,
    max_concurrent_runs: Optional[int] = None,
    timeout_seconds: Optional[int] = None,
    description: Optional[str] = None,
    tags: Optional[Dict[str, str]] = None,
    git_source: Optional[Dict[str, Any]] = None,
    job_clusters: Optional[List[Dict[str, Any]]] = None,
    email_notifications: Optional[Dict[str, Any]] = None,
    webhook_notifications: Optional[Dict[str, Any]] = None,
    notification_settings: Optional[Dict[str, Any]] = None,
    run_as: Optional[Dict[str, Any]] = None,
) -> CreateJobResponse:
    """
    Create a new job.
    
    Creates a job with one or more tasks. Tasks can be notebooks, JAR files,
    Python scripts, SQL queries, or pipelines. Tasks can have dependencies
    to create complex workflows.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        name: Job name
        tasks: List of task configurations
        schedule: Cron schedule (e.g., {"quartz_cron_expression": "0 0 * * *", "timezone_id": "UTC"})
        max_concurrent_runs: Maximum number of concurrent runs
        timeout_seconds: Job timeout in seconds
        description: Job description
        tags: Job tags as key-value pairs
        git_source: Git source configuration
        job_clusters: Job cluster definitions
        email_notifications: Email notification settings
        webhook_notifications: Webhook notification settings
        notification_settings: Notification settings
        run_as: Run as user/service principal
        
    Returns:
        CreateJobResponse with job ID
        
    Task Configuration:
        {
            "task_key": "extract",
            "notebook_task": {"notebook_path": "/ETL/extract"},
            "existing_cluster_id": "cluster-id"
        }
        
    Example:
        # Create single-task job
        job = create_job(
            host, token,
            name="Daily Report",
            tasks=[{
                "task_key": "run_report",
                "notebook_task": {"notebook_path": "/Reports/daily"},
                "existing_cluster_id": "cluster-123"
            }],
            schedule={"quartz_cron_expression": "0 9 * * *", "timezone_id": "UTC"}
        )
        
        # Create multi-task workflow
        job = create_job(
            host, token,
            name="ETL Pipeline",
            tasks=[
                {
                    "task_key": "extract",
                    "notebook_task": {"notebook_path": "/ETL/extract"},
                    "existing_cluster_id": "cluster-123"
                },
                {
                    "task_key": "transform",
                    "notebook_task": {"notebook_path": "/ETL/transform"},
                    "depends_on": [{"task_key": "extract"}],
                    "existing_cluster_id": "cluster-123"
                }
            ]
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import Task, CronSchedule, JobEmailNotifications, WebhookNotifications, JobNotificationSettings, JobRunAs, GitSource, JobCluster
    
    # Convert tasks
    task_objects = []
    for task_dict in tasks:
        task_objects.append(Task.from_dict(task_dict))
    
    # Convert optional params
    schedule_obj = CronSchedule.from_dict(schedule) if schedule else None
    email_obj = JobEmailNotifications.from_dict(email_notifications) if email_notifications else None
    webhook_obj = WebhookNotifications.from_dict(webhook_notifications) if webhook_notifications else None
    notification_obj = JobNotificationSettings.from_dict(notification_settings) if notification_settings else None
    run_as_obj = JobRunAs.from_dict(run_as) if run_as else None
    git_source_obj = GitSource.from_dict(git_source) if git_source else None
    job_clusters_obj = [JobCluster.from_dict(jc) for jc in job_clusters] if job_clusters else None
    
    response = client.jobs.create(
        name=name,
        tasks=task_objects,
        schedule=schedule_obj,
        max_concurrent_runs=max_concurrent_runs,
        timeout_seconds=timeout_seconds,
        description=description,
        tags=tags,
        git_source=git_source_obj,
        job_clusters=job_clusters_obj,
        email_notifications=email_obj,
        webhook_notifications=webhook_obj,
        notification_settings=notification_obj,
        run_as=run_as_obj,
    )
    
    return CreateJobResponse(job_id=response.job_id)


def update_job(
    host: str,
    token: str,
    job_id: int,
    new_settings: Optional[Dict[str, Any]] = None,
    fields_to_remove: Optional[List[str]] = None,
) -> UpdateJobResponse:
    """
    Update job settings.
    
    Updates specific settings of an existing job. Top-level fields are replaced,
    arrays are merged. Use fields_to_remove to delete settings.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID
        new_settings: New job settings (partial update)
        fields_to_remove: List of field paths to remove
        
    Returns:
        UpdateJobResponse confirming update
        
    Example:
        # Update job name and max concurrent runs
        update_job(
            host, token,
            job_id=12345,
            new_settings={
                "name": "Updated ETL Pipeline",
                "max_concurrent_runs": 3
            }
        )
        
        # Remove schedule
        update_job(
            host, token,
            job_id=12345,
            fields_to_remove=["schedule"]
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import JobSettings
    
    settings_obj = JobSettings.from_dict(new_settings) if new_settings else None
    
    client.jobs.update(
        job_id=job_id,
        new_settings=settings_obj,
        fields_to_remove=fields_to_remove,
    )
    
    return UpdateJobResponse(job_id=job_id)


def reset_job(
    host: str,
    token: str,
    job_id: int,
    new_settings: Dict[str, Any],
) -> UpdateJobResponse:
    """
    Reset job settings.
    
    Overwrites ALL job settings with new configuration. Use update_job for
    partial updates.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID
        new_settings: Complete new job settings
        
    Returns:
        UpdateJobResponse confirming reset
        
    Example:
        reset_job(
            host, token,
            job_id=12345,
            new_settings={
                "name": "Completely New Job",
                "tasks": [...],
                "max_concurrent_runs": 1
            }
        )
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import JobSettings
    
    settings_obj = JobSettings.from_dict(new_settings)
    
    client.jobs.reset(
        job_id=job_id,
        new_settings=settings_obj,
    )
    
    return UpdateJobResponse(job_id=job_id, message="Job reset successfully")


def delete_job(
    host: str,
    token: str,
    job_id: int,
) -> DeleteJobResponse:
    """
    Delete a job.
    
    Deletes a job. Active runs are canceled.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID
        
    Returns:
        DeleteJobResponse confirming deletion
        
    Example:
        delete_job(host, token, job_id=12345)
    """
    client = get_workspace_client(host, token)
    
    client.jobs.delete(job_id=job_id)
    
    return DeleteJobResponse(job_id=job_id)


# ============================================================================
# Run Management
# ============================================================================

def run_now(
    host: str,
    token: str,
    job_id: int,
    notebook_params: Optional[Dict[str, str]] = None,
    jar_params: Optional[List[str]] = None,
    python_params: Optional[List[str]] = None,
    python_named_params: Optional[Dict[str, str]] = None,
    spark_submit_params: Optional[List[str]] = None,
    sql_params: Optional[Dict[str, str]] = None,
    dbt_commands: Optional[List[str]] = None,
    idempotency_token: Optional[str] = None,
) -> RunNowResponse:
    """
    Trigger a job run immediately.
    
    Runs a job with optional parameter overrides. Use idempotency_token to
    prevent duplicate runs.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID
        notebook_params: Notebook parameters
        jar_params: JAR parameters
        python_params: Python parameters
        python_named_params: Python named parameters
        spark_submit_params: Spark submit parameters
        sql_params: SQL parameters
        dbt_commands: DBT commands
        idempotency_token: Token to prevent duplicate runs
        
    Returns:
        RunNowResponse with run ID
        
    Example:
        # Run job with parameters
        run = run_now(
            host, token,
            job_id=12345,
            notebook_params={"date": "2024-01-01", "region": "us-west"}
        )
        print(f"Started run {run.run_id}")
        
        # Run with idempotency token
        run = run_now(
            host, token,
            job_id=12345,
            idempotency_token="run-2024-01-01"
        )
    """
    client = get_workspace_client(host, token)
    
    response = client.jobs.run_now(
        job_id=job_id,
        notebook_params=notebook_params,
        jar_params=jar_params,
        python_params=python_params,
        python_named_params=python_named_params,
        spark_submit_params=spark_submit_params,
        sql_params=sql_params,
        dbt_commands=dbt_commands,
        idempotency_token=idempotency_token,
    )
    
    return RunNowResponse(
        run_id=response.run_id,
        number_in_job=response.number_in_job,
    )


def submit_run(
    host: str,
    token: str,
    run_name: str,
    tasks: List[Dict[str, Any]],
    git_source: Optional[Dict[str, Any]] = None,
    timeout_seconds: Optional[int] = None,
    idempotency_token: Optional[str] = None,
    email_notifications: Optional[Dict[str, Any]] = None,
    webhook_notifications: Optional[Dict[str, Any]] = None,
    notification_settings: Optional[Dict[str, Any]] = None,
    run_as: Optional[Dict[str, Any]] = None,
) -> SubmitRunResponse:
    """
    Submit a one-time run.
    
    Submits a workload directly without creating a job. Ideal for ad-hoc
    analysis or one-time data processing tasks.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_name: Run name
        tasks: List of task configurations
        git_source: Git source configuration
        timeout_seconds: Run timeout in seconds
        idempotency_token: Token to prevent duplicate runs
        email_notifications: Email notification settings
        webhook_notifications: Webhook notification settings
        notification_settings: Notification settings
        run_as: Run as user/service principal
        
    Returns:
        SubmitRunResponse with run ID
        
    Example:
        # Submit ad-hoc analysis
        run = submit_run(
            host, token,
            run_name="Ad-hoc Analysis 2024-01-01",
            tasks=[{
                "task_key": "analyze",
                "notebook_task": {"notebook_path": "/Analysis/report"},
                "existing_cluster_id": "cluster-123"
            }]
        )
        print(f"Submitted run {run.run_id}")
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import SubmitTask, GitSource, JobEmailNotifications, WebhookNotifications, JobNotificationSettings, JobRunAs
    
    task_objects = [SubmitTask.from_dict(t) for t in tasks]
    git_source_obj = GitSource.from_dict(git_source) if git_source else None
    email_obj = JobEmailNotifications.from_dict(email_notifications) if email_notifications else None
    webhook_obj = WebhookNotifications.from_dict(webhook_notifications) if webhook_notifications else None
    notification_obj = JobNotificationSettings.from_dict(notification_settings) if notification_settings else None
    run_as_obj = JobRunAs.from_dict(run_as) if run_as else None
    
    response = client.jobs.submit(
        run_name=run_name,
        tasks=task_objects,
        git_source=git_source_obj,
        timeout_seconds=timeout_seconds,
        idempotency_token=idempotency_token,
        email_notifications=email_obj,
        webhook_notifications=webhook_obj,
        notification_settings=notification_obj,
        run_as=run_as_obj,
    )
    
    return SubmitRunResponse(run_id=response.run_id)


def get_run(
    host: str,
    token: str,
    run_id: int,
    include_history: Optional[bool] = None,
) -> RunInfo:
    """
    Get run details.
    
    Returns detailed information about a specific run including state,
    task execution details, and timing information.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID
        include_history: Whether to include repair history
        
    Returns:
        RunInfo with complete run details
        
    Example:
        run = get_run(host, token, run_id=67890)
        print(f"State: {run.state.life_cycle_state}")
        print(f"Result: {run.state.result_state}")
        print(f"Duration: {run.execution_duration}ms")
    """
    client = get_workspace_client(host, token)
    
    run = client.jobs.get_run(
        run_id=run_id,
        include_history=include_history,
    )
    
    # Extract state
    state = None
    if run.state:
        state = RunStateInfo(
            life_cycle_state=run.state.life_cycle_state.value if run.state.life_cycle_state else None,
            state_message=run.state.state_message,
            result_state=run.state.result_state.value if run.state.result_state else None,
            user_cancelled_or_timedout=run.state.user_cancelled_or_timedout,
            queue_reason=run.state.queue_reason,
        )
    
    # Extract tasks
    tasks = None
    if run.tasks:
        tasks = [
            RunTaskInfo(
                task_key=t.task_key,
                run_id=t.run_id,
                state=RunStateInfo(
                    life_cycle_state=t.state.life_cycle_state.value if t.state and t.state.life_cycle_state else None,
                    state_message=t.state.state_message if t.state else None,
                    result_state=t.state.result_state.value if t.state and t.state.result_state else None,
                    user_cancelled_or_timedout=t.state.user_cancelled_or_timedout if t.state else None,
                ) if t.state else None,
                start_time=t.start_time,
                end_time=t.end_time,
                execution_duration=t.execution_duration,
                cleanup_duration=t.cleanup_duration,
                setup_duration=t.setup_duration,
                attempt_number=t.attempt_number,
            )
            for t in run.tasks
        ]
    
    return RunInfo(
        run_id=run.run_id,
        job_id=run.job_id,
        run_name=run.run_name,
        number_in_job=run.number_in_job,
        creator_user_name=run.creator_user_name,
        state=state,
        start_time=run.start_time,
        end_time=run.end_time,
        setup_duration=run.setup_duration,
        execution_duration=run.execution_duration,
        cleanup_duration=run.cleanup_duration,
        run_duration=run.run_duration,
        run_page_url=run.run_page_url,
        run_type=run.run_type.value if run.run_type else None,
        tasks=tasks,
        git_source=run.git_source.as_dict() if run.git_source else None,
        cluster_spec=run.cluster_spec.as_dict() if run.cluster_spec else None,
        trigger=run.trigger.value if run.trigger else None,
    )


def list_runs(
    host: str,
    token: str,
    job_id: Optional[int] = None,
    active_only: Optional[bool] = None,
    completed_only: Optional[bool] = None,
    limit: Optional[int] = None,
    start_time_from: Optional[int] = None,
    start_time_to: Optional[int] = None,
    expand_tasks: Optional[bool] = None,
    page_token: Optional[str] = None,
) -> ListRunsResponse:
    """
    List job runs.
    
    Lists runs for a specific job or all runs in the workspace. Supports
    filtering by state and time range.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Filter by job ID
        active_only: Only return active runs
        completed_only: Only return completed runs
        limit: Maximum number of runs to return
        start_time_from: Filter by start time (epoch ms)
        start_time_to: Filter by start time (epoch ms)
        expand_tasks: Whether to expand task details
        page_token: Token for pagination
        
    Returns:
        ListRunsResponse with list of runs
        
    Example:
        # List all runs for a job
        runs = list_runs(host, token, job_id=12345)
        
        # List active runs only
        runs = list_runs(host, token, job_id=12345, active_only=True)
        
        # List runs in time range
        runs = list_runs(
            host, token,
            job_id=12345,
            start_time_from=1704067200000,  # 2024-01-01
            start_time_to=1704153600000     # 2024-01-02
        )
    """
    client = get_workspace_client(host, token)
    
    runs_list = []
    iterator = client.jobs.list_runs(
        job_id=job_id,
        active_only=active_only,
        completed_only=completed_only,
        limit=limit,
        start_time_from=start_time_from,
        start_time_to=start_time_to,
        expand_tasks=expand_tasks,
        page_token=page_token,
    )
    
    has_more = False
    for run in iterator:
        # Extract state
        state = None
        if run.state:
            state = RunStateInfo(
                life_cycle_state=run.state.life_cycle_state.value if run.state.life_cycle_state else None,
                state_message=run.state.state_message,
                result_state=run.state.result_state.value if run.state.result_state else None,
                user_cancelled_or_timedout=run.state.user_cancelled_or_timedout,
                queue_reason=run.state.queue_reason,
            )
        
        # Extract tasks (simplified for list)
        tasks = None
        if run.tasks and expand_tasks:
            tasks = [
                RunTaskInfo(
                    task_key=t.task_key,
                    run_id=t.run_id,
                    state=RunStateInfo(
                        life_cycle_state=t.state.life_cycle_state.value if t.state and t.state.life_cycle_state else None,
                        result_state=t.state.result_state.value if t.state and t.state.result_state else None,
                    ) if t.state else None,
                    start_time=t.start_time,
                    end_time=t.end_time,
                )
                for t in run.tasks
            ]
        
        runs_list.append(
            RunInfo(
                run_id=run.run_id,
                job_id=run.job_id,
                run_name=run.run_name,
                number_in_job=run.number_in_job,
                creator_user_name=run.creator_user_name,
                state=state,
                start_time=run.start_time,
                end_time=run.end_time,
                setup_duration=run.setup_duration,
                execution_duration=run.execution_duration,
                cleanup_duration=run.cleanup_duration,
                run_duration=run.run_duration,
                run_page_url=run.run_page_url,
                run_type=run.run_type.value if run.run_type else None,
                tasks=tasks,
            )
        )
        
        if hasattr(run, 'has_more'):
            has_more = run.has_more
    
    return ListRunsResponse(
        runs=runs_list,
        count=len(runs_list),
        has_more=has_more,
    )


def cancel_run(
    host: str,
    token: str,
    run_id: int,
) -> CancelRunResponse:
    """
    Cancel a run.
    
    Cancels a running job. The cancellation is asynchronous, so the run may
    still be running when this request completes.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID
        
    Returns:
        CancelRunResponse confirming cancellation
        
    Example:
        cancel_run(host, token, run_id=67890)
    """
    client = get_workspace_client(host, token)
    
    client.jobs.cancel_run(run_id=run_id)
    
    return CancelRunResponse(run_id=run_id)


def cancel_all_runs(
    host: str,
    token: str,
    job_id: Optional[int] = None,
    all_queued_runs: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Cancel all runs of a job.
    
    Cancels all active runs of a job. The cancellations are asynchronous.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID (if omitted, cancels all queued runs in workspace)
        all_queued_runs: Cancel all queued runs
        
    Returns:
        Dict with cancellation status
        
    Example:
        # Cancel all runs of a specific job
        cancel_all_runs(host, token, job_id=12345)
        
        # Cancel all queued runs in workspace
        cancel_all_runs(host, token, all_queued_runs=True)
    """
    client = get_workspace_client(host, token)
    
    client.jobs.cancel_all_runs(
        job_id=job_id,
        all_queued_runs=all_queued_runs,
    )
    
    return {
        "job_id": job_id,
        "message": "All runs canceled successfully"
    }


def delete_run(
    host: str,
    token: str,
    run_id: int,
) -> DeleteRunResponse:
    """
    Delete a run.
    
    Deletes a non-active run. Active runs must be canceled first.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID
        
    Returns:
        DeleteRunResponse confirming deletion
        
    Example:
        delete_run(host, token, run_id=67890)
    """
    client = get_workspace_client(host, token)
    
    client.jobs.delete_run(run_id=run_id)
    
    return DeleteRunResponse(run_id=run_id)


def repair_run(
    host: str,
    token: str,
    run_id: int,
    rerun_tasks: Optional[List[str]] = None,
    rerun_all_failed_tasks: Optional[bool] = None,
    rerun_dependent_tasks: Optional[bool] = None,
    notebook_params: Optional[Dict[str, str]] = None,
    jar_params: Optional[List[str]] = None,
    python_params: Optional[List[str]] = None,
    python_named_params: Optional[Dict[str, str]] = None,
    spark_submit_params: Optional[List[str]] = None,
    sql_params: Optional[Dict[str, str]] = None,
    dbt_commands: Optional[List[str]] = None,
) -> RepairRunResponse:
    """
    Repair a failed run.
    
    Re-executes failed tasks or specific tasks of a completed run. Useful
    for recovering from transient failures or data quality issues.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID to repair
        rerun_tasks: List of specific task keys to rerun
        rerun_all_failed_tasks: Whether to rerun all failed tasks
        rerun_dependent_tasks: Whether to rerun dependent tasks
        notebook_params: Notebook parameters
        jar_params: JAR parameters
        python_params: Python parameters
        python_named_params: Python named parameters
        spark_submit_params: Spark submit parameters
        sql_params: SQL parameters
        dbt_commands: DBT commands
        
    Returns:
        RepairRunResponse with repair ID
        
    Example:
        # Repair all failed tasks
        repair = repair_run(
            host, token,
            run_id=67890,
            rerun_all_failed_tasks=True
        )
        print(f"Repair ID: {repair.repair_id}")
        
        # Repair specific tasks
        repair = repair_run(
            host, token,
            run_id=67890,
            rerun_tasks=["transform", "load"],
            rerun_dependent_tasks=True
        )
    """
    client = get_workspace_client(host, token)
    
    response = client.jobs.repair_run(
        run_id=run_id,
        rerun_tasks=rerun_tasks,
        rerun_all_failed_tasks=rerun_all_failed_tasks,
        rerun_dependent_tasks=rerun_dependent_tasks,
        notebook_params=notebook_params,
        jar_params=jar_params,
        python_params=python_params,
        python_named_params=python_named_params,
        spark_submit_params=spark_submit_params,
        sql_params=sql_params,
        dbt_commands=dbt_commands,
    )
    
    return RepairRunResponse(
        run_id=run_id,
        repair_id=response.repair_id,
    )


def get_run_output(
    host: str,
    token: str,
    run_id: int,
) -> RunOutputInfo:
    """
    Get run output.
    
    Returns the output of a completed run including notebook results, logs,
    and error information.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID
        
    Returns:
        RunOutputInfo with output details
        
    Example:
        output = get_run_output(host, token, run_id=67890)
        if output.error:
            print(f"Run failed: {output.error}")
        elif output.notebook_output:
            print(f"Result: {output.notebook_output}")
    """
    client = get_workspace_client(host, token)
    
    output = client.jobs.get_run_output(run_id=run_id)
    
    # Extract run metadata
    metadata = None
    if output.metadata:
        state = None
        if output.metadata.state:
            state = RunStateInfo(
                life_cycle_state=output.metadata.state.life_cycle_state.value if output.metadata.state.life_cycle_state else None,
                result_state=output.metadata.state.result_state.value if output.metadata.state.result_state else None,
                state_message=output.metadata.state.state_message,
            )
        
        metadata = RunInfo(
            run_id=output.metadata.run_id,
            job_id=output.metadata.job_id,
            state=state,
            start_time=output.metadata.start_time,
            end_time=output.metadata.end_time,
        )
    
    return RunOutputInfo(
        notebook_output=output.notebook_output.as_dict() if output.notebook_output else None,
        sql_output=output.sql_output.as_dict() if output.sql_output else None,
        dbt_output=output.dbt_output.as_dict() if output.dbt_output else None,
        logs=output.logs,
        logs_truncated=output.logs_truncated,
        error=output.error,
        error_trace=output.error_trace,
        metadata=metadata,
    )


def export_run(
    host: str,
    token: str,
    run_id: int,
    views_to_export: Optional[str] = None,
) -> ExportRunResponse:
    """
    Export run views.
    
    Exports views (code, dashboards, etc.) from a run for download or backup.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        run_id: Run ID
        views_to_export: Views to export (CODE, DASHBOARDS, ALL)
        
    Returns:
        ExportRunResponse with exported views
        
    Example:
        # Export all views
        export = export_run(host, token, run_id=67890, views_to_export="ALL")
        for view in export.views:
            print(f"{view.name}: {view.type}")
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import ViewsToExport
    
    views_enum = ViewsToExport(views_to_export) if views_to_export else None
    
    result = client.jobs.export_run(
        run_id=run_id,
        views_to_export=views_enum,
    )
    
    views = []
    if result.views:
        for view in result.views:
            views.append(
                ExportRunView(
                    content=view.content,
                    name=view.name,
                    type=view.type.value if view.type else None,
                )
            )
    
    return ExportRunResponse(views=views)


# ============================================================================
# Permission Management
# ============================================================================

def get_job_permissions(
    host: str,
    token: str,
    job_id: str,
) -> Dict[str, Any]:
    """
    Get job permissions.
    
    Gets the permissions of a job including ACLs.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID (as string)
        
    Returns:
        Dict with permission details
        
    Example:
        permissions = get_job_permissions(host, token, job_id="12345")
        for acl in permissions['access_control_list']:
            principal = acl.get('user_name') or acl.get('group_name')
            perms = [p['permission_level'] for p in acl['all_permissions']]
            print(f"{principal}: {perms}")
    """
    client = get_workspace_client(host, token)
    
    permissions = client.jobs.get_permissions(job_id=job_id)
    
    return permissions.as_dict()


def set_job_permissions(
    host: str,
    token: str,
    job_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Set job permissions.
    
    Sets permissions on a job, replacing existing permissions if they exist.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID (as string)
        access_control_list: List of ACL entries
        
    Returns:
        Dict with updated permission details
        
    ACL Entry Format:
        {
            "user_name": "user@company.com",
            "permission_level": "CAN_MANAGE_RUN"  # or CAN_VIEW, CAN_MANAGE
        }
        
    Permission Levels:
        - CAN_VIEW - View job configuration and runs
        - CAN_MANAGE_RUN - Trigger runs, cancel runs
        - CAN_MANAGE - Full control (edit, delete, permissions)
        
    Example:
        acls = [
            {"user_name": "admin@company.com", "permission_level": "CAN_MANAGE"},
            {"group_name": "data-engineers", "permission_level": "CAN_MANAGE_RUN"},
            {"group_name": "analysts", "permission_level": "CAN_VIEW"}
        ]
        set_job_permissions(host, token, job_id="12345", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import JobAccessControlRequest
    
    acl_requests = [JobAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
    permissions = client.jobs.set_permissions(
        job_id=job_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def update_job_permissions(
    host: str,
    token: str,
    job_id: str,
    access_control_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Update job permissions.
    
    Updates the permissions on a job without replacing all existing permissions.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID (as string)
        access_control_list: List of ACL entries to update
        
    Returns:
        Dict with updated permission details
        
    Example:
        acls = [
            {"user_name": "new-user@company.com", "permission_level": "CAN_VIEW"}
        ]
        update_job_permissions(host, token, job_id="12345", access_control_list=acls)
    """
    client = get_workspace_client(host, token)
    
    from databricks.sdk.service.jobs import JobAccessControlRequest
    
    acl_requests = [JobAccessControlRequest.from_dict(acl) for acl in access_control_list]
    
    permissions = client.jobs.update_permissions(
        job_id=job_id,
        access_control_list=acl_requests,
    )
    
    return permissions.as_dict()


def get_job_permission_levels(
    host: str,
    token: str,
    job_id: str,
) -> Dict[str, Any]:
    """
    Get available permission levels.
    
    Gets the permission levels that a user can have on a job.
    
    Args:
        host: Databricks workspace URL
        token: Authentication token
        job_id: Job ID (as string)
        
    Returns:
        Dict with available permission levels
        
    Example:
        levels = get_job_permission_levels(host, token, job_id="12345")
        for level in levels['permission_levels']:
            print(f"{level['permission_level']}: {level['description']}")
    """
    client = get_workspace_client(host, token)
    
    levels = client.jobs.get_permission_levels(job_id=job_id)
    
    return levels.as_dict()
