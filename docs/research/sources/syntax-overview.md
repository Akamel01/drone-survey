<!-- source: https://dev.epicgames.com/documentation/en-us/realityscan/syntax-overview
     http: 200
     fetched: 2026-09-19T01:49:58Z
     extracted from HTML; wording verbatim, layout lost -->

Syntax Overview | Realityscan Documentation | Epic Developer Community 

Table of Contents 

Developer 

Syntax Overview 

Syntax Overview

Explanation of the paRSer syntax using a simple example. 

To illustrate how paRSer works and how templates are written, here’s a simple example along with a breakdown of its components.

Template: 

paRSer 

Hello world, today is $(dateTime). $ExportProjectInfo( This project is called $(projectName) and has $(componentCount) components. ) 

Hello world, today is $(dateTime). $ExportProjectInfo( This project is called $(projectName) and has $(componentCount) components. ) 
Copy full snippet (1 line long) 

Possible result: 

Hello world, today is Fri, Dec 13, 2024 15:48:35. This project is called MyProject and has 2 components. 

Break down: 

Plain text

Any part of the template that isn’t prefixed by $ or encapsulated by brackets will be seen as it is in the template

In this example:

Hello world, today is 

This project is called … and has … components. 

Variables

Variables are written as $(variableName) and are replaced with their values.

In this example:

$(dateTime): Fri, Dec 13, 2024 15:48:35 

$(projectName): MyProject 

$(componentCount): 2 

Functions

Functions start with $FunctionName(...) .

They may insert text, create scopes, or define new variables.

In this example:

$ExportProjectInfo() defines a scope within its brackets. All variables declared inside this scope are available only within the function and can be invoked there. 

The variables invoked within the function are $(projectName) and $(componentCount). 

Ask questions and help your peers  Developer Forums 

Write your own tutorials or read those from others  Learning Library
