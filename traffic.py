from pathlib import Path
import requests

# Base URL path discovered from the files
BASE_URL = "https://traffic.delhipolice.gov.in/sites/default/files/uploads/2014/01/"
OUTPUT_FOLDER = Path(__file__).resolve().parent / "delhi_traffic_signals"
CIRCLES = ['E', 'F', 'J', 'K', 'L', 'M']

def main():
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    for circle in CIRCLES:
        for num in range(1, 101):
            filename = f"{circle}-{num}.pdf"
            file_url = f"{BASE_URL}{filename}"

            try:
                response = requests.get(file_url, timeout=(5, 20))
                if response.status_code == 200 and response.content.startswith(b"%PDF-"):
                    print(f"Found and Downloading: {filename}")
                    with (OUTPUT_FOLDER / filename).open('wb') as output_file:
                        output_file.write(response.content)
            except requests.exceptions.RequestException:
                print(f"Failed to connect for {filename}")

    print("Scanning complete!")


if __name__ == "__main__":
    main()
