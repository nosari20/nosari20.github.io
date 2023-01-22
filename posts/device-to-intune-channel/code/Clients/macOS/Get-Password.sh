#!/bin/bash

function JSONVal {
   echo ${1} | grep -Po "'${2}': *\K'[^']*'" | sed "s/^'\(.*\)'$/\1/" 
}


# Load certficate

# TODO

# Send request
Url="<AZURE-FUNCTION_URL>"
Url="https://dummyjson.com/products/1" ## test
response=$(curl -X GET ${Url} -sS --write-out '|%{http_code}\n')
RC=$?

if [[ ${RC} == 0 ]]
then

    IFS='|'
    read -a response <<< "$response"

    if [[ ${response[1]} == 200 ]]
    then
        
        response="{'status':'success','password':'P@ssword','device':'MAC-36363'}" ## test
        echo $(JSONVal $response "password")


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