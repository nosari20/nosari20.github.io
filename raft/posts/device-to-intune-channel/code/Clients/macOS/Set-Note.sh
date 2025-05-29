#!/bin/bash

# Search certficate
function findCertAlias { 
    /usr/bin/security find-certificate -a -p > /tmp/certs.pem
    while read line; do
        if [[ "$line" == *"--BEGIN"* ]]; then
            cert=$line
        else
            cert="$cert"$'\n'"$line"
            if [[ "$line" == *"--END"* ]]; then
                echo "$cert" > /tmp/checkcert.pem
                subject=$(openssl x509 -subject -noout -in /tmp/checkcert.pem | cut -d= -f 3)
                issuer=$(openssl x509 -issuer -noout -in /tmp/checkcert.pem | cut -d= -f 3)
                if [[ "$issuer" == "Microsoft Intune MDM Device CA" ]]; then
                    echo $subject
                    break
                fi

            fi
        fi
    done < /tmp/certs.pem
    rm -f /tmp/certs.pem
    rm -f /tmp/checkcert.pem
}

certAlias=$(findCertAlias)


# Send request
Url="<AZURE-FUNCTION_URL>"
response=$(CURL_SSL_BACKEND=secure_transport curl -X POST $Url --cert "$certAlias" -H "Content-Type: application/json" -d "{'Note':'$(profiles status -type enrollment)'}" -sS --write-out '|%{http_code}\n')
RC=$?

if [[ ${RC} == 0 ]]
then

    IFS='|'
    read -a response <<< "$response"

    if [[ ${response[1]} != 200 ]]
    then
        echo "Error for ${Url}"
        echo "HTTP Code: ${response[1]}"
        echo "Body: ${response[0]}"
    fi

else

    echo "Error for ${Url}"
    echo "Exit Code: ${RC}"
    echo "Output: $response"
fi