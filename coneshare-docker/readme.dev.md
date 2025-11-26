## Start & Stop

./start.sh
./stop.sh

## Create superuser

docker compose exec web python3 manage.py createsuperuser

## Database Dump and Restore

docker run --rm -v coneshare-data:/data -v "$PWD/backups:/backups" ${CONESHARE_IMAGE} python3 manage.py dumpdata -o /backups/mydata.json.gz

docker run --rm -v coneshare-data:/data -v "$PWD/backups:/backups" ${CONESHARE_IMAGE} python3 manage.py loaddata /backups/mydata.json.gz -e contenttypes

## Uninstall

./dc down

docker run --rm -v coneshare-data:/data -v "$PWD/backups:/backups" ${CONESHARE_IMAGE} sudo tar -czvf /backups/coneshare-data_`date +%Y-%m-%d"_"%H_%M_%S`.tar.gz /data

docker volume rm coneshare-data
docker volume rm coneshare-postgres
docker volume rm coneshare-redis
