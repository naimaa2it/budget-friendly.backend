Store categories in a simple, flat way in the database (one row/document per category with parent).
When someone asks for categories, your server transforms that flat list into a nested object structure.
Send the nested structure to the front end, since that’s what gives the fastest response and easiest rendering.

## Seeding sample data

A helper script is provided to create a few top‑level categories (electronics, ladies, gents), subcategories, and example products.  Run it from the backend directory:

```bash
cd yourhaatbackend
npm install       # if you haven't already
npm run seed       # connects to MONGODB_URI or localhost and populates sample data
```