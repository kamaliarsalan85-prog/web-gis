# مسیر دیتا
$DataPath = "C:\data\db"

# اگر پوشه دیتا وجود نداشت، بساز
if (-not (Test-Path $DataPath)) {
    New-Item -ItemType Directory -Path $DataPath
}

# مسیر mongod.exe
$MongoExe = "C:\Program Files\MongoDB\Server\8\bin\mongod.exe"

# اجرای MongoDB
& "$MongoExe" --dbpath "$DataPath"
