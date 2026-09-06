# Final Project Proposal

### **Project Title:** Exploring Industry Performance Across Market Conditions

**Group Members:** Kayra Seike Tanrikulu and Emily Biaz

## 1. Topic, Goals, and Questions

### Project Topic

For our final project, we will create an interactive visualization about the U.S. stock market. The project will explore how different groups of companies, including healthcare, energy, finance, manufacturing, and telecommunications, perform when the overall stock market is experiencing different conditions. We will define market conditions using S&P 500 performance to show whether the overall market is increasing or decreasing and the volatility index (VIX) to show whether the market is relatively calm or volatile. Our main focus will be on visualization rather than complicated financial or statistical analysis, allowing users to explore historical market patterns through five connected and interactive visualizations.

### Visualization Goals

Our main visualization goals are to:

* Show how market conditions change over time.
* Compare industry performance across market conditions.
* Help users identify patterns and relationships.
* Allow users to interactively explore industries and time periods.

### Intended Audience

Our visualization is intended for a general audience, including users with little or no finance knowledge. Simple explanations and visual representations will make the data accessible without requiring knowledge of complex financial concepts.

### Research and Exploration Questions

Our project will focus on one main research question:
  **How does industry performance differ across different U.S. stock market conditions?**
  
To explore this main question, our visualizations will help users investigate several related questions:
1.	When did different market conditions occur? 
2.	What do the different market conditions look like in terms of market performance and volatility? 
3.	How does industry performance differ across these market conditions? 
4.	Which industries tend to behave similarly or differently under different market conditions? 
5.	How does a particular industry's performance change as overall market conditions change?


## 2. Dataset(s)
We plan to use daily observations from July 2016 through June 2026, giving us approximately ten years of data. 

### Dataset 1: [S&P 500](https://fred.stlouisfed.org/series/SP500)

**Source:** Federal Reserve Economic Data (FRED)

**Acquisition:** We will download the daily S&P 500 data from FRED.

**Processing:** We will clean the data and calculate S&P 500 returns to determine whether the market was increasing or decreasing.

**Size:** Approximately 2609 date records and 2 variables.

**Attributes:** Date, S&P 500 value, and calculated return.

### Dataset 2: [CBOE Volatility Index: VIX](https://fred.stlouisfed.org/series/VIXCLS)

**Source:** Federal Reserve Economic Data (FRED)

**Acquisition:** We will download the daily VIX data from FRED.

**Processing:** We will clean the dates and missing values and use VIX with S&P 500 returns to define our market conditions.

**Size:** Approximately 2609 date records and 2 variables.

**Attributes:** Date and VIX value.

### Dataset 3: [12 Industry Portfolios Daily](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html)

**Source:** Kenneth R. French Data Library

**Acquisition:** We will download the daily 12 Industry Portfolios dataset from the Kenneth R. French Data Library.

**Processing:** We will clean the data and merge it with the S&P 500 and VIX datasets by date.

**Size:** Approximately 2500 daily observations and 13 variables.

**Attributes:** Date and returns for Consumer Nondurables, Consumer Durables, Manufacturing, Energy, Chemicals, Business Equipment, Telecommunications, Utilities, Retail, Healthcare, Finance, and Other.


## 3. Analysis and Visualization Methods
We will use D3.js/JavaScript for visualizations, HTML/CSS for the interface, and Python for data processing.

### Data Analysis and Processing
We will merge the datasets by date, calculate S&P 500 returns, and use returns and VIX to define four market conditions. We will then compare industry performance across conditions and use correlations to identify similar industries.	

### Visualization Methods
Our project will include five connected interactive visualizations:
1.	**Market Conditions Timeline:** Temporal line chart showing market conditions over time, with brushing and hovering.
2.	**Market Conditions Scatterplot:** S&P 500 returns versus VIX, with selection and hovering.
3.	**Industry Performance Heatmap:** Compares the 12 industries across market conditions, with industry and condition selection.
4.	**Industry Similarity Network:** Shows industry correlations, with filtering and selection.
5.	**Interactive Industry Comparison:** Compares selected industries over time, with selection, zooming, and hovering details.

**Main User Tasks:** Users can compare industries, identify trends, filter data, and explore industry relationships.


## 4. Visualization Sketches or References

**1. Temporal Line Chart:** Establish when market conditions occurred; provides a time-based filter.

![Visualization 1 Sketch](images/visualization1.png)

**2. Scatterplot:** Explain market conditions to non-finance users.

![Visualization 2 Sketch](images/visualization2.png)

**3. Heatmap:** Helps identify consistent industries across market conditions. 

![Visualization 3 Sketch](images/visualization3.png)

**4. Network:** Reveals relationships between industries across market conditions.

![Visualization 4 Sketch](images/visualization4.png)

**5. Multi-series Line Chart:** Shows heatmap averages over time for selected industries.

![Visualization 5 Sketch](images/visualization5.png)


## 5. Group Roles and Responsibilities

### [Member 1 Name]

**Kayra Seike Tanrikulu**
* Data acquisition, cleaning, processing, integration
* D3.js implementation of: Timeline and Heatmap

**Emily Biaz**
* Visualization, interaction, interface design
* D3.js implementation of: Scatterplot, Network, Industry Comparison

**Shared Responsibilities**
* Connecting visualizations
* Testing and debugging
* Documentation and presentations


## 6. Interim Presentation Deliverables
By the Interim Presentation, we plan to have the datasets cleaned and combined, market conditions defined, and initial analysis completed. We will also have designs for all five visualizations and at least two working D3.js prototypes. We will present our initial findings, designs, prototypes, and an example of interaction between visualizations.

## 7. Timeline and Milestones

| Week       | Milestone                   | Tasks                                                                                              | Responsible Member(s) | Expected Output                                |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| **Week 2** | Project Definition          | Finalize research questions, datasets, visualization goals, and sketches                           | Kayra & Emily         | Final proposal and visualization plan          |
| **Week 3** | Data Preparation            | Clean and merge datasets, calculate returns, define market conditions, and explore the data        | Kayra & Emily         | Cleaned dataset and initial analysis           |
| **Week 4** | Visualization Development   | Begin building the five visualizations in D3.js and add basic interactions                         | Kayra & Emily         | Initial D3.js visualizations                   |
| **Week 5** | Interim Prototype           | Complete the timeline and heatmap, connect initial interactions, and prepare presentation          | Kayra & Emily         | Working prototype and interim presentation     |
| **Week 6** | Implementation & Refinement | Complete all five visualizations and improve the interface                                         | Kayra & Emily         | Complete interactive visualization             |
| **Week 7** | Final Integration           | Test, debug, refine visual design, and prepare presentation                                        | Kayra & Emily         | Final project & presentation                   |
