import os
import requests

# Create a folder to save your downloaded dataset
output_folder = "delhi_traffic_signals"
os.makedirs(output_folder, exist_ok=True)

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
            response = requests.get(file_url, timeout=5)
            
            if response.status_code == 200:
                print(f"Found and Downloading: {filename}")
                with open(os.path.join(output_folder, filename), 'wb') as f:
                    f.write(response.content)
            else:
                # File doesn't exist, skip quietly
                continue
        except requests.exceptions.RequestException:
            print(f"Failed to connect for {filename}")

print("Scanning complete!")
