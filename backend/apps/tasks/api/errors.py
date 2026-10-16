"""The not-found answers that several of the tasks API's routers give."""

from __future__ import annotations

from apps.core.schemas import ErrorOut

TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
PROJECT_NOT_FOUND = ErrorOut(detail="Project not found.")
FOLDER_NOT_FOUND = ErrorOut(detail="Folder not found.")
SECTION_NOT_FOUND = ErrorOut(detail="Section not found.")
TAG_NOT_FOUND = ErrorOut(detail="Tag not found.")
PERSON_NOT_FOUND = ErrorOut(detail="Person not found.")
