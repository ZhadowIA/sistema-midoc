rd /s /q node_modules
del package-lock.json
npm install
npx prisma generate
