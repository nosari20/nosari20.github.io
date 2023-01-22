#!/bin/bash

function JSONVal {
   echo ${1} | grep -Po "'${2}': *\K'[^']*'" | sed "s/^'\(.*\)'$/\1/" 
}

# Generate password
PASSWORD=(cat /dev/urandom | tr -dc '[:alpha:]' | fold -w ${1:-16} | head -n 1)


# Load certficate

# TODO

# Send request
Url="<AZURE-FUNCTION_URL>"
response=$(curl -X POST ${Url} -H "Content-Type: application/json" -d "{'Password':'${PASSWORD}'}" -sS --write-out '|%{http_code}\n')
RC=$?

if [[ ${RC} == 0 ]]
then

    IFS='|'
    read -a response <<< "$response"

    if [[ ${response[1]} == 200 ]]
    then
        
        response="{'status':'success','password':'P@ssword','device':'MAC-36363'}" ## test
        $pass=$(echo $(JSONVal $response "password"))
        $device=$(echo $(JSONVal $response "device"))

        if [[ ${pass} == $PASSWORD ]]
        then

            ## Set password using manufacturer tools/API/WMI (examples at : https://woshub.com/powershell-view-change-bios-settings/)
            ## Use the same code from Get-Password.sh to retrieve old password
            /usr/bin/expect -c "spawn /usr/sbin/firmwarepasswd -setpasswd ; expect ":" ; send "$PASSWORD" ; expect ":" ; send "$PASSWORD" ; interact"

            if [[ ${RC} == 0 ]]
            then
                 echo "Password set for ${device}"
            else
                echo "Error setting password for ${device}"
            fi

        else
            echo  "Problem sending generated password, remote password does not match genrated password (password was not set)"
        fi

    else
        echo "Error for ${Url}"
        echo "HTTP Code: ${response[1]}"
        echo "Body: ${response[0]}"
    fi

else

    echo "Error for ${Url}"
    echo "Exit Code: ${RC}"
    echo "Output: $response"
fi