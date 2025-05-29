#!/bin/bash

APIURL="<AZURE-FUNCTION_URL>"
DOMAIN="<DOMAIN>"
CANAME="<CANAME>"


# Search certificate
function findCertAlias { 

    CERTISSUER=$1
    CERTOU=$2

    /usr/bin/security find-certificate -a -p > /tmp/certs.pem
    while read line; do
        if [[ "$line" == *"--BEGIN"* ]]; then
            cert=$line
        else
            cert="$cert"$'\n'"$line"
            if [[ "$line" == *"--END"* ]]; then
                echo "$cert" > /tmp/checkcert.pem
                subject=$(openssl x509 -subject -noout -in /tmp/checkcert.pem | sed 's/.*CN=\([^/]*\).*/\1/')
                subjectOU=$(openssl x509 -subject -noout -in /tmp/checkcert.pem | sed 's/.*OU=\([^/]*\).*/\1/')
                issuer=$(openssl x509 -issuer -noout -in /tmp/checkcert.pem | sed 's/.*CN=\([^/]*\).*/\1/')
                purpose=$(openssl x509 -purpose -noout -in /tmp/checkcert.pem)

                if [[ "$issuer" == $CERTISSUER ]] && [[ "$subjectOU" == $CERTOU ]] && (echo $purpose | grep -q "SSL client CA : No" ); then
                    echo $subject
                    break
                fi
            fi
        fi
    done < /tmp/certs.pem
    rm -f /tmp/certs.pem
    rm -f /tmp/checkcert.pem
}

# Set user picture for a specific user
function setUserPicture {

    # Inspiraton: https://copyprogramming.com/howto/setting-account-picture-jpegphoto-with-dscl-in-terminal

    USERNAME="$1"
    USERPIC="$2"

    PICTUREFOLDER="/Library/User Pictures/Pictures"

    # Check if user exist
    if /usr/bin/id -u "${USERNAME}" &>/dev/null; then

        # Copy picture to public folder and set permissions to allow login windows display
        mkdir -p "${PICTUREFOLDER}"
        cp "${USERPIC}" "${PICTUREFOLDER}/${USERNAME}.jpeg"
        chmod a+rx "${PICTUREFOLDER}/${USERNAME}.jpeg"
        
        # Delete previous data
        dscl . delete /Users/$USERNAME JPEGPhoto ||
        dscl . delete /Users/$USERNAME Picture ||

        # Set new profile picture
        dscl . create /Users/$USERNAME Picture "${PICTUREFOLDER}/${USERNAME}.jpeg"
        PICIMPORT="$(mktemp /tmp/${USERNAME}_dsimport.XXXXXX)"
        MAPPINGS='0x0A 0x5C 0x3A 0x2C'
        ATTRS='dsRecTypeStandard:Users 2 dsAttrTypeStandard:RecordName externalbinary:dsAttrTypeStandard:JPEGPhoto'
        printf "%s %s \n%s:%s" "${MAPPINGS}" "${ATTRS}" "${USERNAME}" "${PICTUREFOLDER}/${USERNAME}.jpeg" > "${PICIMPORT}"
        /usr/bin/dsimport "${PICIMPORT}" /Local/Default M &&
        rm "${PICIMPORT}"
    fi
}

# Download user picture
function downloadUserPicture {

    CERTALIAS=$1
    UPN=$2

    response=$(CURL_SSL_BACKEND=secure_transport curl -X GET "$APIURL&UPN=$UPN" --cert "$CERTALIAS" -sS --write-out '|%{http_code}\n' -o /tmp/$UPN.jpeg)
    RC=$?

    if [[ ${RC} == 0 ]]; then

        IFS='|'
        read -a response <<< "$response"

        if [[ ${response[1]} != 200 ]]
        then

            echo "Error for ${APIURL}&UPN=${UPN}" >&2
            echo "HTTP Code: ${response[1]}" >&2
            echo "Body: $(cat /tmp/${UPN}.jpeg)" >&2
            rm -f /tmp/$UPN.jpeg
            return 1
        fi
        echo "/tmp/$UPN.jpeg"
        return 0
    else

        echo "Error for ${APIURL}&UPN=${UPN}" >&2
        echo "Exit Code: ${RC}" >&2
        echo "Output: $response" >&2
        rm -f /tmp/$UPN.jpeg
        return 1
    fi
}

# Get alias of Intune provided certificate
certAlias=$(findCertAlias "$DOMAIN" "AzureFunction")

for user in $(dscl . -list /Users | grep "$DOMAIN"); do

    echo $user
    # @ must be added
    picture="$(downloadUserPicture $certAlias ${user//"$DOMAIN"/"@$DOMAIN"})"
    RC=$?
    if [[ ${RC} == 0 ]]; then
        setUserPicture $user $picture
    fi

done