from pathlib import Path
import requests

# Base URL path discovered from the files
BASE_URL = "https://traffic.delhipolice.gov.in/sites/default/files/uploads/2014/01/"
OUTPUT_FOLDER = Path(__file__).resolve().parent / "delhi_traffic_signals"
CIRCLES = ['E', 'F', 'J', 'K', 'L', 'M']

def main():
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session:
        for circle in CIRCLES:
            for num in range(1, 101):
                filename = f"{circle}-{num}.pdf"
                destination = OUTPUT_FOLDER / filename
                if destination.is_file() and destination.stat().st_size > 5:
                    with destination.open('rb') as existing:
                        if existing.read(5) == b"%PDF-":
                            continue
                file_url = f"{BASE_URL}{filename}"

                try:
                    response = session.get(file_url, timeout=(5, 20))
                    if response.status_code == 200 and response.content.startswith(b"%PDF-"):
                        print(f"Found and Downloading: {filename}")
                        destination.write_bytes(response.content)
                except requests.exceptions.RequestException:
                    print(f"Failed to connect for {filename}")

    print("Scanning complete!")


if __name__ == "__main__":
    main()
