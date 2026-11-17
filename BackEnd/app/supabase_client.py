#Import so we can access environment variables
import os

#import Path to find the location of our .env file
from pathlib import Path

#Load settings stored in our .env file
from dotenv import load_dotenv

#Import the function that creates python to supabase
from supabase import create_client

#find the backend folder where the .env file is located
backend_folder = Path(__file__).resolve().parent.parent

#Load supabase credentials from BackEnd/.env file
load_dotenv(backend_folder / ".env")

#Get the supabase URL and key from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")

#Check that both settings are available
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError(
        "Supabase URL or publishable key is missing"
        )

#Create a supabase client to interact with the database
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)