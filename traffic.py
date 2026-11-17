import os
from pathlib import Path
import requests

# Create a folder to save your downloaded dataset
output_folder = Path(__file__).resolve().parent / "delhi_traffic_signals"
output_folder.mkdir(parents=True, exist_ok=True)

# Base URL path discovered from the files
base_url = "https://traffic.delhipolice.gov.in/sites/default/files/uploads/2014/01/"

# Common traffic circle letter codes used by Delhi Police
circles = ['E', 'F', 'J', 'K', 'L', 'M'] 
# Loop through circles and intersection numbers 1 to 100
for circle in circles:
    for num in range(1, 101):
        filename = f"{circle}-{num}.pdf"
        file_url = f"{base_url}{filename}"
        
        try:
            # Send a request to see if the file exists
            response = requests.get(file_url, timeout=(5, 20))
            
            if response.status_code == 200 and response.content.startswith(b"%PDF-"):
                print(f"Found and Downloading: {filename}")
                with (output_folder / filename).open('wb') as f:
                    f.write(response.content)
            else:
                # File doesn't exist, skip quietly
                continue
        except requests.exceptions.RequestException:
            print(f"Failed to connect for {filename}")

print("Scanning complete!")
