<small>Tuesday, March 20, 2024</small>

## Components

---

UI components are a must-have for any app or website, but their definition and application can vary widely depending on who you ask or what framework you’re developing in. Let’s cover all the basics and reduce components to their most simple, scalable form.

### What are they?

A component is a standalone UI elements that’s reused throughout a project. An easy example is a page header, where every header should look and feel the same across all pages. Rather than make edits to one header and copy/paste them to every page, it’s much more efficient to save the header as a component and simply reference it on each page. Another example is a card in a list of cards, where each has the same visual style but require independent text and imagery.

Components exist to save you time and effort, to centralize design decisions, and make a project more scalable.

### Terminology

Like other abstract web concepts we tend to describe components in different ways (views, templates, widgets, etc.), sometimes with meanings that are confusing, overlapping, or poorly termed. In our travels through design & development, here’s what my team observes as the most common verbiage:

- **Component**—a generic term used to reference a reusable UI element in its entirety, including the main component and all its instances.

- **Main component**—the source content that lives in a single place. Edits to a main component will effect every instance.

- **Instance**—an individual instance of a component living on a page, or even inside another main component (that’s right, components can be nested where appropriate). Edits to an instance will only affect that instance.

### Designer vs. developer components

My first experiences with components were in the design platforms Adobe XD and Figma, generating main components and applying their instances to mockups. It made fast work of UI mockups for a guy who was born in the Microsoft Paint era.

If a designer uses a component for an element, a developer should too and vice versa; it syncs up a team’s efforts and efficiencies. But let’s acknowledge that developer components have more complexity and consideration. First, let’s not kid ourselves: if something needs to appear on a page, it needs all its code to do so. That means the DOM is rendered with the main component’s code compiling in place for every instance. If you use the browser inspector to look at instances on a page, it looks like a bunch of static elements were copy/pasted. And in fact they were—by an automated compiler that does the heavy lifting and eliminates human error.

The way in which the developer generates the main component and applies instances varies by framework, most of which require a build process to compile the project before publishing. In Sitrus we very intentionally avoid a build process in favour of all the magic happening client-side—right in the browser. More on that below.

### Developers: is it a component?

Beyond terminology, another existential programming debate is whether a reusable UI element is a component. Is every button a component? What about a header that shares some common traits with the others, but has some unique aspects? The simplest rubric is to ask yourself if—on the whole—is it more or less effort (and code) to componentize? Let’s break it down:

- **Don’t reinvent HTML.** If the component is supported by an existing HTML element, like a `<button>` or `<input>`, in essence it’s already been componentized by HTML itself. Componentizing these yourself results in more effort and code, defeating the purpose.

For example, here’s what the main component of a button would like like in Sitrus:

    <template x-component.unwrap="button">
        <button :class=“$prop(‘style’)” x-text="$prop('text')">
        </button>
    </template>

And its instances are applied like:

    <x-button style=“primary” text=“Learn more”></x-button>

But in good old vanilla HTML, we only need to place buttons as:

    <button class=“primary”>Learn more</button>

- **Don’t reinvent CSS.** Note that the common trait in the example above is the styling, since by nature a button will have an icon or text defined on the spot. This is much easier done with a simple, semantic class `primary` will centralize visual control of all buttons requiring the primary style. Essentially we can already componentize via CSS, most often exemplified by styles baked into text elements like `<h1>`, `<p>`, `<a>`, etc. So if you don’t need to componentize a simple element for content purposes, don’t do it just for styling when a class will do.

- **Don’t componentize single-use elements.** Pretty simple—there’s no need for a component if there’s only one instance. Just drop code directly on the page.

- **Don’t componentize an entire page.** Say you’re making a page to hold blog posts. You’ll want a consistent layout for all posts, but for UX and SEO purposes the post’s contents need to load based on a variable URL path like `domain.com/blogs/[blog-post-slug]`.

This cannot be accomplished by components on their own because we need to tap into the project’s routing system to traffic the blog data. It’s much more efficient to use a page template that can retrieve blog posts from a content management system.

- **Do componentize multi-layer elements.** UI elements like cards have multiple descendant elements for things like media, a title, timestamp, description, etc. This is prime real estate to centralize coding into a main component, knowing that it will be applied across numerous instances.

Styling elements in Sitrus occurs directly in HTML with Tailwind utility classes and semantic modifier classes like `primary`. This means all styling can be managed directly in the main component—and believe me, this is a joy after getting lost in stylesheets most of my life.

- **Do componentize things that are always the same.** Headers, footers, and other common menus are examples of components with identical instances. It’d be crazy not to.

- **Do componentize things that aren’t always the same.** Components are most powerful when they allow you to manipulate an instance’s styles and content on the fly. Here’s an example of a header’s main component in Sitrus:

    <template x-component.unwrap="header">
        <header>
            <nav>
                <x-logo class=“h-7”></x-logo>
                <div class=“row items-enter gap-xs”>
                    <a href=“/products”>Products</a>
                    <a href=“/pricing”>Pricing</a>
                    <a href=“/showcase”>Showcase</a>
                </div>
            </nav>
        </header>
    </template>

And instances are applied on each page with `<x-header></x-header>`, easy!

[Image]

Now say there’s one page where the header requires the nested `<nav>` element to have a different background colour of black, and the _Showcase_ link needs to switch to _Support_. Even though this is a one-off use case, it makes sense to piggyback on the header component because we still want every instance to benefit from central edits to common traits. Let’s update the main component:

    <template x-component.unwrap="header">
        <header>
            <nav :class=“$prop(‘nav-style’)”> <!— Add a way to inject unique content into a nested element’s attribute, in this case for Tailwind utility classes -->
                <x-logo class=“h-7”></x-logo>
                <a href=“/products”>Products</a>
                <a href=“/pricing”>Products</a>
                <a :href="$prop('last-link-url') ? $prop('last-link-url') : '/showcase'" x-text="$prop('last-link-text') ? $prop('last-link-text') : ‘Showcase'"></a> <!-- Add a way for this last link to have unique text and URL if required, otherwise the defaults for Showcase kick in -->
            </nav>
        </header>
    </template>

And the instance becomes: `<x-header nav-style=“bg-black” last-link-text=“Support last-link-url=“/support”></x-header>`. Overall we retain centralized control of the header while instances can be customized as required—with less code than it would have taken to make a detached, standalone header.

### Considerations

- **Nested components.** Is it worth putting components inside other components? Sometimes yes! In the code snippets above we embedding an `x-logo` instance inside the header, allowing us to centralize control of the logo elsewhere and sprinkle it around the project. Not all design platforms or developer frameworks support component nesting (it can get quite hairy programmatically), so make sure you choose a supporting solution if required.

- **Downstream elements.** Say you have a header component with a button that opens a modal. Should the modal code live inside the header component? That depends—if the modal is unique to the header, no problem. If it can be opened from other spots in the interface—including other instances on the same page—it could make more sense to put the modal directly on the page (or as its own component instance on the page). Modern frameworks will support component interactions with external elements (including other components) regardless of how or when they were populated, or their order in the DOM.

### Components in Sitrus

I’ve seen developers try and fail to build robust component systems from scratch. It’s easier said than done supporting the likes of nested components and child element overrides without huge hits on performance… and developer sanity.

The Sitrus framework always looks to incorporate the most simple, scalable open source solutions for complex problems before native development is considered. As a dev community we’re stronger together, move faster, and bring greater adoption to deserving solutions. Little is more complex than componentization, and for all the benefits of Alpine.js—Sitrus’ underlying engine—it purposefully steers clear of components at time of writing, deferring component use-cases to the larger server-side frameworks like Vue and React.

A guiding principle of Sitrus is to remain client-side, so our component support was looking dire for a bit. Had anyone ever aced client-side components with mounting and lifecycles? Would it be possible to go back to simple HTML page editing without managing dozens of view files, each requiring upfront imports and scoped styles? From my layman perspective, the status quo for components appeared a lot more complex than it needed to be for the computing and web capabilities of 2024. And so I was elated to discover VimeshUI, a stroke of genius from developer Xinjie Zhang that extends Alpine with an incredibly robust and customizable component system, supporting every test case we could think to throw at it.

Sitrus natively incorporates VimeshUI using the namespace `x-[component-name]` to look nice alongside Alpine directives. Making a component is easy:

1. In `/pages/components`, create a file `[component-name].html`.
2. Start with the tag `<template x-component.unwrap=“[component-name]“></template>`, and place your component’s HTML inside it.
3. For any page that will display the component, add it to the page body tag’s `x-import` attribute, comma-separated with no spaces, like `<body x-data="app" x-cloak x-import=“header,logo,[component-name]“>`
4. Drop instances on the page with `<x-[component-name]></x-[component-name]>`

And that’s about as simple as it gets for the amount of horsepower under the hood. Consider contributing to VimeshUI on its GitHub, and if you’re using Sitrus, you can dive deeper into our component docs. Happy time saving!
