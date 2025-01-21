# Project Setup Guide 

This guide provides a high-level overview of how to start and configure the Supabase service, Vite React app, and EAS React Native application.

## TL;DR Steps

### 1. Supabase Service

1. **Install Supabase CLI:**

   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**

   ```bash
   supabase login
   ```

3. **Link your Supabase Project:**
   Replace `<projectId>` with your Supabase project ID.

   ```bash
   supabase link --project-ref <projectId>
   ```

4. **Start the Supabase Service:**

   - For development mode:
     ```bash
     supabase start
     ```
   - To serve Supabase functions locally:
     ```bash
     supabase functions serve
     ```
     Ensure your environment variables are properly configured to match the function requirements.

5. **Set Up Environment Variables:**

   - Add a `.env` file to the root of your Supabase project with the following content:
     ```env
     SUPABASE_URL=<your-supabase-url>
     SUPABASE_ANON_KEY=<your-supabase-anon-key>
     SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
     ```

6. **Check Configuration:**
   Ensure your `.env` file values are loaded properly for both `supabase start` and `supabase functions serve` commands.

---

### 2. Vite React App

1. **Install Dependencies:**

   ```bash
   npm install
   ```

2. **Add Environment Variables:**
   Create a `.env` file in the root directory and add:

   ```env
   VITE_SUPABASE_URL=<your-supabase-url>
   VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
   ```

3. **Start the Vite Development Server:**

   ```bash
   npm run dev
   ```

4. **Verify Connection:**
   Ensure your app is properly connecting to the Supabase backend by testing functionality.

---

### 3. EAS React Native Application

1. **Install EAS CLI:**

   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS:**

   ```bash
   eas login
   ```

3. **Configure EAS Project:**
   Run this in the project directory and follow the prompts:

   ```bash
   eas build:configure
   ```

4. **Add Supabase Client Configuration:**
   Update your `supabaseClient.js` or equivalent file with the correct Supabase URL and anon key. Use `dotenv` to manage environment variables:

   ```javascript
   import { createClient } from '@supabase/supabase-js';

   const supabaseUrl = process.env.SUPABASE_URL;
   const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

   export const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

5. **Set Up Environment Variables for React Native:**
   Use a library like `react-native-dotenv` to manage environment variables. Install it:

   ```bash
   npm install react-native-dotenv
   ```

   Add a `.env` file with the following content:

   ```env
   SUPABASE_URL=<your-supabase-url>
   SUPABASE_ANON_KEY=<your-supabase-anon-key>
   ```

   Update your `babel.config.js`:

   ```javascript
   module.exports = {
     presets: ['module:metro-react-native-babel-preset'],
     plugins: ['module:react-native-dotenv'],
   };
   ```

6. **Build or Run Locally:**
   - For local development:
     ```bash
     npm start
     ```
   - For testing on a device/emulator:
     ```bash
     eas build --platform <android|ios>
     ```

---

## Quick Functions and Notes

- **Supabase CLI:**

  - `supabase link --project-ref <projectId>`: Links your Supabase project.
  - `supabase start`: Starts the local Supabase service.
  - `supabase functions serve`: Serves Supabase functions locally.

- **Environment Variable Management:**

  - For **Supabase**, ensure your `.env` contains:
    ```env
    SUPABASE_URL=<your-supabase-url>
    SUPABASE_ANON_KEY=<your-supabase-anon-key>
    SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
    ```
  - For **Vite**, use `VITE_` prefixed variables in `.env`:
    ```env
    VITE_SUPABASE_URL=<your-supabase-url>
    VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
    ```
  - For **React Native**, use `react-native-dotenv` to load variables from `.env`:
    ```env
    SUPABASE_URL=<your-supabase-url>
    SUPABASE_ANON_KEY=<your-supabase-anon-key>
    ```

- **EAS:**
  - Always login (`eas login`) before running builds.
  - `eas build:configure` ensures proper linking to EAS projects.

## Additional Configuration

- For **Supabase**, ensure all required database migrations are applied using:

  ```bash
  supabase db push
  ```

- For **React Native**, install necessary dependencies like `react-native-dotenv` to manage environment variables.

- Keep all sensitive credentials secure using `.env` and avoid hardcoding them in your codebase.

---
