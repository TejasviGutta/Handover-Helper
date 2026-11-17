#Import APIRouter from FastAPI
#APIRouter helps organize related API endpoints in one file
#Import FastAPI tools for creating routes and setting response codes
from fastapi import APIRouter, status, HTTPException, Depends
#Import function that checks user authentication
from app.auth import get_current_user
#import Pydantic to validate incoming handover data
from pydantic import BaseModel, Field
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from app.supabase_client import SUPABASE_URL, SUPABASE_KEY

#Create a router for managing employee handovers
#All in this file will start with "/handovers"
router = APIRouter(
prefix="/handovers",
    tags=["Handovers"],
)

bearer = HTTPBearer()

#define the information required to create a handover
class HandoverCreate(BaseModel):
    #Project that employee is leaving
    project_name: str = Field(min_length=1, max_length=100, description="Name of the project the employee is leaving")
    #Name of the employee who is leaving the project
    departing_employee: str = Field(min_length=1, max_length=100, description="Name of the departing employee")
    #Name of the employee who is taking over the project
    incoming_employee: str = Field(min_length=1, max_length=100, description="Name of the incoming employee")

#Define the information returned when retrieving a handover
#All fields are optional because not all we may wan to change one field at a time
class HandoverUpdate(BaseModel):
    #Project name updater if needed
    project_name: str | None = Field(
        default=None, min_length=1, max_length=100, description="Updated name of the project"
        )
    #Update departing employee name if needed
    departing_employee: str | None = Field(
        default=None, min_length=1, max_length=100, description="Updated name of the departing employee"
        )
    #Update incoming employee name if needed
    incoming_employee: str | None = Field(
        default=None, min_length=1, max_length=100, description="Updated name of the incoming employee"
        )


#Create a GET endpoint to retrieve all handovers
#GET is used to retrieve information
#Endpoint checks whether Handover API is working
@router.get("/health")
def checkHandover():

#Return  the message "Handover API is working" to confirm the API is functional
    return {
        "status": "Working",
        "message": "Handover Management API is running"
    }

#Creat POST endpoint at "/handovers"
#POST is used to create new information to backend
#HTTP 201 means a resource has been successfully created
@router.post("", status_code=status.HTTP_201_CREATED)
def create_handover(
    data: HandoverCreate,
                    # Get the login token from the request.
    credentials: HTTPAuthorizationCredentials = Depends(bearer),

    # Verify the logged-in user through Supabase.
    current_user = Depends(get_current_user)
    ):
    # Create a database client specifically for this request.
    # This prevents different users from sharing login sessions.
    db = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Give the database the authenticated user's token.
    # Supabase uses it to enforce Row Level Security.
    db.postgrest.auth(credentials.credentials)

    # Prepare the information we want to save.
    # These names match the columns in our Supabase table.
    new_handover = {
        "project_name": data.project_name,
        "departing_employee": data.departing_employee,
        "incoming_employee": data.incoming_employee,

        # Associate the handover with its creator.
        "created_by": str(current_user.id)
    }

    try:
        # Insert the new handover into the database.
        # Supabase generates its ID, status, and creation date.
        response = (
            db.table("handovers")
            .insert(new_handover)
            .select("*")
            .execute()
        )

    except Exception as error:
        # Log the error type and code without exposing credentials.
        print("Database error:", type(error).__name__)
        print("Error code:", getattr(error, "code", None))

        # Tell the frontend that saving failed.
        raise HTTPException(
            status_code=500,
            detail="Unable to save handover in Supabase"
        ) from error

    # Make sure Supabase returned the saved record.
    if not response.data:
        raise HTTPException(
            status_code=500,
            detail="No handover was returned by Supabase"
        )

    # Return the saved handover.
    return response.data[0]

#Create a GET endpoint to retrieve all handovers
@router.get("")
def get_handovers(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user = Depends(get_current_user)
):
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    db.postgrest.auth(credentials.credentials)
    
    try:
        response = (
            db.table("handovers")
            .select("*")
            .eq("created_by", str(current_user.id))
            .execute()
        )
        
    except Exception as error:
        print("Database error:", type(error).__name__)
        print("Error code:", getattr(error, "code", None))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve handovers from Supabase"
        ) from error
    #Return the list of all handovers
    #retrieve records from supabase
    return {
        "total": len(response.data),
        "handovers": response.data
    }

#GET endpoint to retrieve a specific handover by its ID
#handover_id comes from the URL
@router.get("/{handover_id}")
def get_handover(
    handover_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user = Depends(get_current_user)
    ):

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    db.postgrest.auth(credentials.credentials)

    try:
        response =(
            db.table("handovers")
            .select("*")
            .eq("id", handover_id)
            .eq("created_by", str(current_user.id))
            .execute()
        )
    except Exception as error:
        print("Database error:", type(error).__name__)
        print("Error Code:", getattr(error, "code", None))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve handover from Supabase"
        ) from error
    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Handover not found"
        )
    return response.data[0]
#PATCH used to update existing handover
#ID tells us which handover to update
@router.patch("/{handover_id}")
def update_handover(
    handover_id: str,
    data: HandoverUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user = Depends(get_current_user)
):
    submitted_changes = data.model_dump(
        exclude_unset=True,
        exclude_none=True
    )

    field_names = {
        "projectName": "project_name",
        "departingEmployee": "departing_employee",
        "incomingEmployee": "incoming_employee",
        "project_name": "project_name",
        "departing_employee": "departing_employee",
        "incoming_employee": "incoming_employee"
    }
    changes = {
    # Match each submitted field to its database column
    field_names[field]: value

    # Go through the information the user submitted
    for field, value in submitted_changes.items()

    # Only include fields that are allowed to be updated
    if field in field_names
    }

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="Please provide at least one field to update"
        )
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    db.postgrest.auth(credentials.credentials)

    try: 
        # Find the user's draft handover and update its information
        response = (
            db.table("handovers")
            .update(changes)
            .eq("id", handover_id)
            .eq("created_by", str(current_user.id))
            .eq("status", "draft")
            .select("*")
            .execute()
        )
    except Exception as error:
        # Print error information for troubleshooting
        print("Database error:", type(error).__name__)
        print("Error code:", getattr(error, "code", None))

        # Return an error if the database request fails
        raise HTTPException(
            status_code=500,
            detail="Unable to update handover in Supabase"
        ) from error
    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="Draft handover not found or not editable"
        ) 
    return response.data[0]

#Create a PATCH endpoint to approve an existing handover
@router.patch("/{handover_id}/approve")
def approve_handover(
    handover_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    current_user = Depends(get_current_user)
):
    try:
        # Connect to Supabase using the user's token
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
        db.postgrest.auth(credentials.credentials)

        # Check the logged-in user's role
        profile_response = (
            db.table("profiles")
            .select("role")
            .eq("id", str(current_user.id))
            .limit(1)
            .execute()
        )

        # Only admins can approve handovers
        if (
            not profile_response.data
            or profile_response.data[0]["role"] != "admin"
        ):
            raise HTTPException(
                status_code=403,
                detail="Only admins can approve handovers"
            )

        # Find the handover in Supabase
        handover_response = (
            db.table("handovers")
            .select("status")
            .eq("id", handover_id)
            .limit(1)
            .execute()
        )

        # Check whether the handover exists
        if not handover_response.data:
            raise HTTPException(
                status_code=404,
                detail="Handover not found"
            )

        current_status = handover_response.data[0]["status"]

        # Prevent approving the same handover twice
        if current_status == "approved":
            raise HTTPException(
                status_code=409,
                detail="Handover is already approved"
            )

        # Only draft handovers can be approved
        if current_status != "draft":
            raise HTTPException(
                status_code=409,
                detail="Only draft handovers can be approved"
            )

        # Update the handover status in Supabase
        response = (
            db.table("handovers")
            .update({"status": "approved"})
            .eq("id", handover_id)
            .eq("status", "draft")
            .select("*")
            .execute()
        )

        # Check whether the update succeeded
        if not response.data:
            raise HTTPException(
                status_code=409,
                detail="Handover could not be approved"
            )

        # Return the approved handover
        return response.data[0]

    except HTTPException:
        # Preserve expected errors (403, 404, 409)
        raise

    except Exception as error:
        # Handle unexpected database errors
        print("Approval database error:", type(error).__name__)

        raise HTTPException(
            status_code=500,
            detail="Unable to approve handover in Supabase"
        ) from error

#Create a GET endpoint to test user authentication 
@router.get("/auth/check")
def check_authenticaion(
    current_user = Depends(get_current_user)
):
    #If user is authenticated return the user ID
    return {
        "message" : "User is authenticated",
        "user_id" : str(current_user.id)
    }