"""Admin API endpoints for skills (Git connection test)."""

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from config import logger


class GitConfigModel(BaseModel):
    """Git configuration for skills."""

    repo_url: str
    path: Optional[str] = ""
    target_dir: Optional[str] = None
    token: Optional[str] = None
    ssh_key_file: Optional[str] = None
    clone_options: Optional[Dict[str, Any]] = None


class TestGitRequest(BaseModel):
    """Request body for testing Git connection. Accepts gitConfig (camelCase) from Node."""

    model_config = ConfigDict(populate_by_name=True)

    git_config: Optional[GitConfigModel] = Field(None, alias="gitConfig")


class TestGitResponse(BaseModel):
    """Response for successful Git connection test."""

    message: str


router = APIRouter(prefix="/api/admin/skills", tags=["admin"])


@router.post("/test-git", response_model=TestGitResponse)
async def test_git_connection(request: TestGitRequest):
    """Test Git repository connection for skills.

    Validates that the provided Git config can clone the repository
    and discover skills. Used by the admin UI before saving a Git-based skill.

    Args:
        request: Git configuration to test

    Returns:
        TestGitResponse on success

    Raises:
        HTTPException: On validation or connection failure
    """
    logger.info("test_git_connection: request received, git_config=%s", bool(request.git_config))

    try:
        from pydantic_ai_skills.registries.git import GitCloneOptions, GitSkillsRegistry
        logger.info("test_git_connection: GitSkillsRegistry import OK")
    except ImportError as e:
        logger.warning("test_git_connection: ImportError - pydantic-ai-skills[git] not installed: %s", e)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "pydantic-ai-skills[git] not installed",
                "details": "Install with: pip install pydantic-ai-skills[git]",
            },
        )

    gc = request.git_config
    if not gc:
        raise HTTPException(
            status_code=400,
            detail={"error": "git_config or gitConfig is required"},
        )
    # Convert dict clone_options to GitCloneOptions (library expects object, not dict)
    raw_clone = gc.clone_options
    clone_options = None
    if raw_clone and isinstance(raw_clone, dict):
        sparse = raw_clone.get("sparse_paths")
        if isinstance(sparse, str):
            sparse = [s.strip() for s in sparse.split(",") if s.strip()]
        elif not isinstance(sparse, list):
            sparse = []
        clone_options = GitCloneOptions(
            depth=raw_clone.get("depth"),
            branch=raw_clone.get("branch"),
            single_branch=raw_clone.get("single_branch", False),
            sparse_paths=sparse,
            env=raw_clone.get("env") or {},
            multi_options=raw_clone.get("multi_options") or [],
            git_options=raw_clone.get("git_options") or {},
        )

    config_dict = {
        "repo_url": gc.repo_url,
        "path": gc.path or "",
        "target_dir": gc.target_dir,
        "token": gc.token,
        "ssh_key_file": gc.ssh_key_file,
        "clone_options": clone_options,
    }
    logger.info("test_git_connection: config repo_url=%s path=%s", config_dict["repo_url"], config_dict["path"])

    try:
        registry = GitSkillsRegistry(
            repo_url=config_dict["repo_url"],
            path=config_dict["path"],
            target_dir=config_dict.get("target_dir"),
            token=config_dict.get("token"),
            ssh_key_file=config_dict.get("ssh_key_file"),
            clone_options=config_dict.get("clone_options"),
        )
        skills = registry.get_skills()
        count = len(skills) if skills else 0
        logger.info("test_git_connection: success, found %d skill(s)", count)
        return TestGitResponse(
            message=f"Successfully connected. Found {count} skill(s) in repository."
        )
    except Exception as e:
        logger.warning("test_git_connection: Git skills test failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Failed to connect to Git repository",
                "details": str(e),
            },
        )
