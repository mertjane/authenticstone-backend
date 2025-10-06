import express from "express";

const router = express.Router();

/**
 * GET /api/megamenu
 * Fetch megamenu structure with urls
 */
router.get("/", async (req, res) => {
  try {
    // Fetch categories using native fetch
    const catRes = await fetch("http://localhost:4000/api/categories");
    if (!catRes.ok) throw new Error("Failed to fetch categories");
    const categories = await catRes.json();

    // Normalize helper
    const normalize = (str) => str.toLowerCase().trim().replace(/\s+/g, "-");

    // Find matching og_url
    const findCategoryUrl = (title) => {
      if (!title || !categories?.length) return null;
      const normalizedTitle = normalize(title);

      let cat = categories.find(
        (c) =>
          normalize(c.slug) === normalizedTitle ||
          c.name.toLowerCase() === title.toLowerCase()
      );
      if (cat) return cat.og_url || null;

      cat = categories.find((c) => normalize(c.slug).includes(normalizedTitle));
      if (cat) return cat.og_url || null;

      return null;
    };

    // Attribute term IDs
    const attrIds = [6, 2, 8];
    const attrTermsMap = {};

    // Fetch attribute terms using fetch
    await Promise.all(
      attrIds.map(async (attrId) => {
        const response = await fetch(
          `http://localhost:4000/api/attribute/${attrId}/terms`
        );
        if (!response.ok)
          throw new Error(`Failed to fetch terms for attribute ${attrId}`);
        const json = await response.json();
        attrTermsMap[attrId] = json.data;
      })
    );

    // Map terms to menu items
    const mapTermsWithLink = (terms) =>
      (terms || []).map((term) => ({
        title: term.name,
        slug: term.slug,
        link: findCategoryUrl(term.name),
      }));

    // Define your grouping logic manually:
    const groupStoneColours = (terms) => {
      // Lowercase slug helper
      const slug = (t) => (t.slug || "").toLowerCase();

      // Define groups and which slugs belong where:
      const groups = {
        whites: ["white", "ivory", "ivory-cream", "whites"],
        blacks: ["black", "black-and-white", "blacks"],
        greys: ["grey", "greys", "slate"],
        "beiges-browns": ["beige-brown", "brown", "beiges-browns"],
        "creams-yellows": ["cream-yellow", "cream", "yellow", "creams-yellows"],
        "blues-greens": ["blue-green", "green", "blues-greens"],
        "reds-pinks": ["red", "red-pink", "reds-pinks"],
        "multicolors-patterns": ["multicolor", "multicolors-patterns"],
      };

      // Build groups as children with slugs + titles and link=null
      const result = Object.entries(groups).map(([key, slugs]) => {
        // Find any matching terms for this group slugs to pick a display title (or fallback)
        const matchedTerm = terms.find((t) => slugs.includes(slug(t)));

        // Use a clean title from the groups key or matchedTerm
        let title;
        switch (key) {
          case "whites":
            title = "Whites";
            break;
          case "blacks":
            title = "Blacks";
            break;
          case "greys":
            title = "Greys";
            break;
          case "beiges-browns":
            title = "Beiges & Browns";
            break;
          case "creams-yellows":
            title = "Creams & Yellows";
            break;
          case "blues-greens":
            title = "Blues & Greens";
            break;
          case "reds-pinks":
            title = "Reds & Pinks";
            break;
          case "multicolors-patterns":
            title = "Multicolors & Patterns";
            break;
          default:
            title = matchedTerm?.name || key;
        }

        return {
          title,
          slug: key,
          link: null,
        };
      });

      return result;
    };

    // Build megamenu
    const megaMenu = [
      {
        title: "Stone Collection",
        link: findCategoryUrl("Stone Collection"),
        children: [
          {
            title: "Natural Stone Tiles",
            link: findCategoryUrl("Natural Stone Tiles"),
            children: [
              { title: "Marble Tiles", link: findCategoryUrl("Marble Tiles") },
              {
                title: "Limestone Tiles",
                link: findCategoryUrl("Limestone Tiles"),
              },
              {
                title: "Stone Mosaic Tiles",
                link: findCategoryUrl("Mosaic Tiles"),
              },
              {
                title: "Travertine Tiles",
                link: findCategoryUrl("Travertine Tiles"),
              },
              { title: "Slate Tiles", link: findCategoryUrl("Slate Tiles") },
              { title: "Stone Pavers", link: findCategoryUrl("Stone Pavers") },
              {
                title: "Granite Tiles",
                link: findCategoryUrl("Granite Tiles"),
              },
              {
                title: "Clay Brick Slips",
                link: findCategoryUrl("Clay Brick Slips"),
              },
            ],
          },
          {
            title: "Stone Slabs",
            link: findCategoryUrl("Stone Slabs"),
            children: [
              {
                title: "Bookmatch Slabs",
                link: findCategoryUrl("Bookmatch Slabs"),
              },
              { title: "Slabs", link: findCategoryUrl("Slabs") },
              { title: "Vanity Tops", link: findCategoryUrl("Vanity Tops") },
              {
                title: "Off Cut Granite & Quartz",
                link: findCategoryUrl("Off Cut Granite & Quartz"),
              },
            ],
          },
          {
            title: "Stone Colours",
            link: findCategoryUrl("Stone Colours"),
            children: groupStoneColours(attrTermsMap[6] || []),
          },
          {
            title: "Usage Areas",
            link: findCategoryUrl("Usage Areas"),
            children: mapTermsWithLink(attrTermsMap[8]),
          },
          {
            title: "Stone Finishes",
            link: findCategoryUrl("Stone Finishes"),
            children: mapTermsWithLink(attrTermsMap[2]),
          },
        ],
      },
      {
        title: "Custom Stonework",
        link: findCategoryUrl("Custom Stonework"),
        children: [
          { title: "Window Sills", link: findCategoryUrl("Window Sills") },
          { title: "Mouldings", link: findCategoryUrl("Mouldings") },
          { title: "Skirtings", link: findCategoryUrl("Skirtings") },
          { title: "Stone Sinks", link: findCategoryUrl("Stone Sinks") },
          { title: "Slate Hearths", link: findCategoryUrl("Slate Hearths") },
          { title: "Table Tops", link: findCategoryUrl("Table Tops") },
        ],
      },
      {
        title: "Design & Pattern Collection",
        link: findCategoryUrl("Design & Pattern Collection"),
        children: [
          {
            title: "Chequerboard Tiles",
            link: findCategoryUrl("Chequerboard Tiles"),
          },
          {
            title: "Herringbone Tiles",
            link: findCategoryUrl("Herringbone Tiles"),
          },
          { title: "Hexagon Tiles", link: findCategoryUrl("Hexagon Tiles") },
          { title: "Metro Tiles", link: findCategoryUrl("Metro Tiles") },
          {
            title: "Maxi Chequerboard Tiles",
            link: findCategoryUrl("Maxi Chequerboard Tiles"),
          },
          {
            title: "Octagon Cabochon Tiles",
            link: findCategoryUrl("Octagon Cabochon Tiles"),
          },
          { title: "Triangle Tiles", link: findCategoryUrl("Triangle Tiles") },
        ],
      },
      {
        title: "Stone Project",
        link: findCategoryUrl("Stone Project"),
        children: [
          {
            title: "Conventional Projects",
            link: findCategoryUrl("Conventional Projects"),
          },
          {
            title: "Residential Projects",
            link: findCategoryUrl("Residential Projects"),
          },
        ],
      },
    ];

    // Send response
    res.json({
      success: true,
      message: "Megamenu data fetched successfully",
      data: megaMenu,
    });
  } catch (error) {
    console.error("Failed to build megamenu", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch megamenu data",
    });
  }
});

export default router;

